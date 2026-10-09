// People and beasts that walk across the map, drawn stroke by stroke like a
// hand-coloured engraving: legs that swing and bend at the knee, arms that
// swing against them, a body that bobs with each step, the head and hat
// turned the way they're going. Soldiers in their nation's coats with
// muskets shouldered, a drummer and the colours at the head of the column;
// riders whose horses trot; wagons whose wheels turn; pack trains; canoes
// with paddles dipping; small ships pitching on the swell with a wake.
// `phase` is where they are in their stride (radians); it only moves while
// they're walking and the clock runs, so a paused world stops mid-step.

import { figureColors, lookOf } from "../engine/Appearance";
import type { Character } from "../engine/Types";

type C = CanvasRenderingContext2D;

/** What someone wears, for their little figure. */
export interface FigureColors {
  coat: string;
  breeches: string;
  hat: string | null;
  skin: string;
  hair: string;
}

const INK = "rgba(38,24,12,0.9)";

const SKINS = ["#e9c8a8", "#e2bb98", "#d8ab86", "#c99a74"];
const NATIVE_SKINS = ["#b97c55", "#a86c47", "#c28a62"];
const HAIRS = [
  "#2b1d12",
  "#4a3020",
  "#6b4a2a",
  "#8a6a3e",
  "#2f2a26",
  "#a07a50",
];
const COATS = [
  "#5a3a2a",
  "#3e4a5a",
  "#6a5a3a",
  "#4a5a3a",
  "#7a3a2a",
  "#3a3a3a",
  "#6e5a48",
];
const NATIVE_COATS = ["#7a2a22", "#2e4a6a", "#5a6a3a", "#8a6a3e", "#3a3028"];

function pick<T>(list: readonly T[], n: number): T {
  return list[((n % list.length) + list.length) % list.length];
}

/**
 * Colours for someone's figure: from their painted look (the clothes they
 * wear in their portrait), or a steady stand-in for nobody in particular.
 */
export function figureColorsOf(
  c: Character | undefined,
  native: boolean,
  coat?: string,
): FigureColors {
  if (c) return figureColors(lookOf(c, 30));
  const id = 0;
  const h = Math.imul(id + 11, 2654435761) >>> 0;
  return {
    coat: coat ?? pick(native ? NATIVE_COATS : COATS, h),
    breeches: native
      ? "#8a6a48"
      : pick(["#2b2420", "#6e5a48", "#e3d3ad", "#3e4a5a"], h >>> 5),
    hat: native ? null : pick(["#262019", "#3a2a1a", "#262019"], h >>> 9),
    skin: pick(native ? NATIVE_SKINS : SKINS, h >>> 13),
    hair: pick(HAIRS, h >>> 17),
  };
}

function darken(hex: string, k: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}

function seg(
  c: C,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w: number,
  color: string,
): void {
  c.strokeStyle = color;
  c.lineWidth = w;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
}

/** A leg: hip to knee to foot, with its angle in the stride. */
function legAt(
  hx: number,
  hy: number,
  len: number,
  phase: number,
  dir: number,
  swing: number,
): { kx: number; ky: number; fx: number; fy: number } {
  const thigh = swing * Math.sin(phase);
  // The knee bends while the leg comes forward.
  const bend = 0.75 * Math.max(0, -Math.cos(phase)) * (swing / 0.45);
  const shin = thigh - bend;
  const l1 = len * 0.52;
  const l2 = len * 0.5;
  const kx = hx + Math.sin(thigh) * l1 * dir;
  const ky = hy + Math.cos(thigh) * l1;
  return {
    kx,
    ky,
    fx: kx + Math.sin(shin) * l2 * dir,
    fy: ky + Math.cos(shin) * l2,
  };
}

export interface WalkerOpts {
  female?: boolean;
  native?: boolean;
  /** What's in their hands or on their back. */
  carry?: "musket" | "pack" | "staff" | "bow" | "drum" | "flag" | null;
  /** The colours they carry, for a flag. */
  flag?: string;
  /** Crossbelts and a cocked hat: a soldier. */
  soldier?: boolean;
  /** How far the legs swing (0 standing). */
  stride?: number;
  shadow?: boolean;
}

/**
 * A walking figure standing on (x, y), `h` pixels tall, facing `dir`
 * (1 right, -1 left), `phase` through its stride.
 */
export function drawWalker(
  c: C,
  x: number,
  y: number,
  h: number,
  phase: number,
  dir: number,
  col: FigureColors,
  o: WalkerOpts = {},
): void {
  const swing = o.stride ?? 0.45;
  const legLen = h * 0.44;
  // Which foot is lowest decides how high the body rides: the bob.
  const hip0 = -legLen;
  const a = legAt(0, hip0, legLen, phase, dir, swing);
  const b = legAt(0, hip0, legLen, phase + Math.PI, dir, swing);
  const lift = Math.max(a.fy, b.fy);
  const oy = y - lift;
  const hx = x;
  const hy = oy + hip0;
  const shoulderY = hy - h * 0.3;
  const headR = h * 0.085;
  const headY = shoulderY - headR * 1.15;
  const lw = Math.max(1.2, h * 0.085);
  const lean = dir * h * 0.015;
  c.save();
  if (o.shadow !== false) {
    c.fillStyle = "rgba(30,20,10,0.28)";
    c.beginPath();
    c.ellipse(x, y + 0.5, h * 0.2, h * 0.05, 0, 0, Math.PI * 2);
    c.fill();
  }
  const stocking = o.native ? "#7a5a3a" : "#ddd3bc";
  const far = {
    leg: darken(o.native ? "#7a5a3a" : stocking, 0.72),
    shoe: "#1c140c",
  };
  // Legs: far one first, darker.
  const drawLeg = (l: typeof a, near: boolean) => {
    const kx = x + l.kx;
    const ky = oy + l.ky;
    const fx = x + l.fx;
    const fy = oy + l.fy;
    const thighCol = o.native
      ? near
        ? "#8a6a48"
        : "#6a5038"
      : near
        ? col.breeches
        : darken(col.breeches, 0.7);
    seg(c, hx, hy, kx, ky, lw * 1.15, INK);
    seg(c, hx, hy, kx, ky, lw, thighCol);
    seg(c, kx, ky, fx, fy, lw * 1.05, INK);
    seg(c, kx, ky, fx, fy, lw * 0.85, near ? stocking : far.leg);
    // Shoe.
    seg(
      c,
      fx - dir * lw * 0.2,
      fy,
      fx + dir * lw * 1.1,
      fy,
      lw * 0.9,
      far.shoe,
    );
  };
  const front = Math.sin(phase) > 0 ? a : b;
  const back = front === a ? b : a;
  const armLen = h * 0.3;
  const armSwing = 0.5 * Math.sin(phase) * (swing / 0.45);
  const arm = (ang: number, color: string) => {
    const ex = hx + lean + Math.sin(ang) * armLen * 0.5 * dir;
    const ey = shoulderY + Math.cos(ang) * armLen * 0.5;
    const hx2 = ex + Math.sin(ang + 0.35) * armLen * 0.5 * dir;
    const hy2 = ey + Math.cos(ang + 0.35) * armLen * 0.5;
    seg(c, hx + lean, shoulderY + lw * 0.3, ex, ey, lw * 1.1, INK);
    seg(c, hx + lean, shoulderY + lw * 0.3, ex, ey, lw * 0.9, color);
    seg(c, ex, ey, hx2, hy2, lw * 0.85, color);
    c.fillStyle = col.skin;
    c.beginPath();
    c.arc(hx2, hy2, lw * 0.45, 0, Math.PI * 2);
    c.fill();
    return [hx2, hy2] as const;
  };
  if (!o.female) drawLeg(back, false);
  // The far arm (behind the body), unless it's busy shouldering something.
  if (o.carry !== "musket" && o.carry !== "flag")
    arm(-armSwing, darken(col.coat, 0.65));
  // Body: a long coat flaring at the skirts, or a gown.
  c.fillStyle = col.coat;
  c.strokeStyle = INK;
  c.lineWidth = Math.max(0.8, h * 0.025);
  c.beginPath();
  if (o.female) {
    const sway = Math.sin(phase * 2) * h * 0.02;
    c.moveTo(hx + lean - h * 0.07, shoulderY);
    c.lineTo(hx + lean + h * 0.07, shoulderY);
    c.lineTo(hx + h * 0.08, hy - h * 0.02);
    c.quadraticCurveTo(
      hx + h * 0.2 + sway,
      y - h * 0.08,
      hx + h * 0.17 + sway,
      y,
    );
    c.lineTo(hx - h * 0.17 + sway, y);
    c.quadraticCurveTo(
      hx - h * 0.2 + sway,
      y - h * 0.08,
      hx - h * 0.08,
      hy - h * 0.02,
    );
  } else if (o.native) {
    // A matchcoat or blanket over the shoulders, a breechcloth.
    c.moveTo(hx + lean - h * 0.08, shoulderY);
    c.lineTo(hx + lean + h * 0.08, shoulderY);
    c.lineTo(hx + h * 0.1, hy + h * 0.06);
    c.lineTo(hx - h * 0.1, hy + h * 0.06);
  } else {
    const flare = h * 0.12 + Math.abs(Math.sin(phase)) * h * 0.02;
    c.moveTo(hx + lean - h * 0.075, shoulderY);
    c.lineTo(hx + lean + h * 0.075, shoulderY);
    c.lineTo(hx + flare, hy + h * 0.1);
    c.lineTo(hx - flare, hy + h * 0.1);
  }
  c.closePath();
  c.fill();
  c.stroke();
  if (o.soldier) {
    // White crossbelts.
    seg(
      c,
      hx + lean - h * 0.07,
      shoulderY + h * 0.01,
      hx + h * 0.07,
      hy,
      h * 0.025,
      "#f2ead8",
    );
    seg(
      c,
      hx + lean + h * 0.07,
      shoulderY + h * 0.01,
      hx - h * 0.07,
      hy,
      h * 0.025,
      "#f2ead8",
    );
  }
  if (!o.female) drawLeg(front, true);
  // Head, hair, hat.
  c.fillStyle = col.skin;
  c.strokeStyle = INK;
  c.lineWidth = Math.max(0.6, h * 0.018);
  c.beginPath();
  c.arc(hx + lean * 1.4, headY, headR, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.fillStyle = col.hair;
  c.beginPath();
  if (o.native && !o.female) {
    // A roach: a crest of hair down the middle.
    c.ellipse(
      hx + lean * 1.4 - dir * headR * 0.1,
      headY - headR * 0.9,
      headR * 0.3,
      headR * 0.55,
      0,
      0,
      Math.PI * 2,
    );
  } else {
    c.arc(
      hx + lean * 1.4 - dir * headR * 0.35,
      headY - headR * 0.1,
      headR * 0.8,
      Math.PI * 0.6,
      Math.PI * 2.1,
    );
  }
  c.fill();
  if (o.native && o.female) {
    seg(
      c,
      hx + lean * 1.4 - dir * headR * 0.6,
      headY,
      hx - dir * headR,
      headY + h * 0.18,
      headR * 0.7,
      col.hair,
    );
  }
  if (col.hat) {
    c.fillStyle = col.hat;
    c.strokeStyle = INK;
    c.beginPath();
    if (o.female) {
      // A cap.
      c.ellipse(
        hx + lean * 1.4 - dir * headR * 0.15,
        headY - headR * 0.45,
        headR * 0.95,
        headR * 0.6,
        0,
        Math.PI,
        Math.PI * 2,
      );
    } else if (o.soldier) {
      // A cocked hat.
      const cx = hx + lean * 1.4;
      const cy = headY - headR * 0.75;
      c.moveTo(cx - headR * 1.45, cy + headR * 0.15);
      c.quadraticCurveTo(
        cx,
        cy - headR * 1.2,
        cx + headR * 1.45,
        cy + headR * 0.15,
      );
      c.quadraticCurveTo(
        cx,
        cy - headR * 0.25,
        cx - headR * 1.45,
        cy + headR * 0.15,
      );
    } else {
      // A broad-brimmed hat.
      const cx = hx + lean * 1.4;
      const cy = headY - headR * 0.55;
      c.rect(cx - headR * 0.65, cy - headR * 0.85, headR * 1.3, headR * 0.85);
      c.moveTo(cx - headR * 1.35, cy + headR * 0.05);
      c.lineTo(cx + headR * 1.35, cy + headR * 0.05);
      c.lineTo(cx + headR * 1.35, cy - headR * 0.15);
      c.lineTo(cx - headR * 1.35, cy - headR * 0.15);
    }
    c.fill();
    c.stroke();
  }
  if (o.native && !o.female && !col.hat) {
    // A feather.
    seg(
      c,
      hx + lean * 1.4 - dir * headR * 0.2,
      headY - headR * 1.2,
      hx - dir * headR * 0.9,
      headY - headR * 2.3,
      h * 0.03,
      "#efe9dc",
    );
  }
  // What they carry, and the near arm.
  const shoulderX = hx + lean;
  switch (o.carry) {
    case "musket": {
      const mx = shoulderX + dir * h * 0.03;
      seg(
        c,
        mx - dir * h * 0.05,
        shoulderY + h * 0.22,
        mx + dir * h * 0.12,
        shoulderY - h * 0.32,
        h * 0.035,
        "#4a3020",
      );
      seg(
        c,
        mx + dir * h * 0.08,
        shoulderY - h * 0.2,
        mx + dir * h * 0.13,
        shoulderY - h * 0.36,
        h * 0.02,
        "#9aa0a6",
      );
      arm(0.2, col.coat);
      break;
    }
    case "flag": {
      const px = shoulderX + dir * h * 0.08;
      seg(
        c,
        px,
        shoulderY + h * 0.25,
        px,
        shoulderY - h * 0.55,
        h * 0.025,
        "#4a3020",
      );
      const wave = Math.sin(phase * 1.3) * h * 0.04;
      c.fillStyle = o.flag ?? "#b3242a";
      c.strokeStyle = INK;
      c.beginPath();
      c.moveTo(px, shoulderY - h * 0.55);
      c.quadraticCurveTo(
        px - dir * h * 0.15,
        shoulderY - h * 0.5 + wave,
        px - dir * h * 0.32,
        shoulderY - h * 0.53,
      );
      c.lineTo(px - dir * h * 0.3, shoulderY - h * 0.3 + wave);
      c.quadraticCurveTo(
        px - dir * h * 0.15,
        shoulderY - h * 0.27 - wave,
        px,
        shoulderY - h * 0.32,
      );
      c.closePath();
      c.fill();
      c.stroke();
      arm(0.6, col.coat);
      break;
    }
    case "drum": {
      c.fillStyle = "#c9a24a";
      c.strokeStyle = INK;
      c.beginPath();
      c.ellipse(
        shoulderX + dir * h * 0.1,
        hy - h * 0.02,
        h * 0.09,
        h * 0.07,
        0,
        0,
        Math.PI * 2,
      );
      c.fill();
      c.stroke();
      const beat = Math.sin(phase * 2);
      arm(0.9 + beat * 0.3, col.coat);
      break;
    }
    case "pack": {
      c.fillStyle = "#8a6a3e";
      c.strokeStyle = INK;
      c.beginPath();
      c.roundRect(
        shoulderX - dir * h * 0.2,
        shoulderY - h * 0.02,
        h * 0.14,
        h * 0.2,
        h * 0.03,
      );
      c.fill();
      c.stroke();
      arm(armSwing, col.coat);
      break;
    }
    case "staff": {
      const [ax, ay] = arm(armSwing * 0.5 + 0.3, col.coat);
      seg(c, ax, ay - h * 0.25, ax + dir * h * 0.04, y, h * 0.022, "#5a3e22");
      break;
    }
    case "bow": {
      c.strokeStyle = "#5a3e22";
      c.lineWidth = h * 0.025;
      c.beginPath();
      c.arc(
        shoulderX - dir * h * 0.08,
        shoulderY + h * 0.05,
        h * 0.2,
        -1.2,
        1.2,
      );
      c.stroke();
      arm(armSwing, col.coat);
      break;
    }
    default:
      arm(armSwing, col.coat);
  }
  c.restore();
}

/** A horse (and rider), trotting: legs in diagonal pairs. */
export function drawRider(
  c: C,
  x: number,
  y: number,
  h: number,
  phase: number,
  dir: number,
  col: FigureColors,
  horse = "#6b4a2a",
  rider = true,
): void {
  const bodyY = y - h * 0.48 - Math.abs(Math.sin(phase)) * h * 0.03;
  const bw = h * 0.42;
  c.save();
  c.fillStyle = "rgba(30,20,10,0.28)";
  c.beginPath();
  c.ellipse(x, y + 0.5, h * 0.36, h * 0.06, 0, 0, Math.PI * 2);
  c.fill();
  const legs = [
    [x + dir * bw * 0.32, phase],
    [x - dir * bw * 0.32, phase + Math.PI],
    [x + dir * bw * 0.22, phase + Math.PI],
    [x - dir * bw * 0.42, phase],
  ] as const;
  legs.forEach(([lx, p], i) => {
    const a = Math.sin(p) * 0.45;
    const kx = lx + Math.sin(a) * h * 0.2 * dir;
    const ky = bodyY + h * 0.16 + Math.cos(a) * h * 0.2;
    const fx =
      kx + Math.sin(a - Math.max(0, -Math.cos(p)) * 0.6) * h * 0.18 * dir;
    const fy = ky + h * 0.17;
    const color = i < 2 ? horse : darken(horse, 0.7);
    seg(c, lx, bodyY + h * 0.08, kx, ky, h * 0.06, INK);
    seg(c, lx, bodyY + h * 0.08, kx, ky, h * 0.045, color);
    seg(c, kx, ky, fx, Math.min(fy, y), h * 0.035, color);
  });
  // Body, neck, head, tail.
  c.fillStyle = horse;
  c.strokeStyle = INK;
  c.lineWidth = Math.max(0.8, h * 0.02);
  c.beginPath();
  c.ellipse(x, bodyY + h * 0.05, bw * 0.55, h * 0.13, 0, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.beginPath();
  c.moveTo(x + dir * bw * 0.4, bodyY);
  c.lineTo(x + dir * bw * 0.62, bodyY - h * 0.2);
  c.lineTo(x + dir * bw * 0.8, bodyY - h * 0.14);
  c.lineTo(x + dir * bw * 0.56, bodyY + h * 0.06);
  c.closePath();
  c.fill();
  c.stroke();
  seg(
    c,
    x - dir * bw * 0.52,
    bodyY,
    x - dir * bw * 0.72,
    bodyY + h * 0.16 + Math.sin(phase) * h * 0.03,
    h * 0.04,
    darken(horse, 0.6),
  );
  if (rider) {
    const rx = x - dir * bw * 0.05;
    const ry = bodyY - h * 0.02;
    c.fillStyle = col.coat;
    c.beginPath();
    c.moveTo(rx - h * 0.06, ry - h * 0.28);
    c.lineTo(rx + h * 0.06, ry - h * 0.28);
    c.lineTo(rx + h * 0.09, ry);
    c.lineTo(rx - h * 0.09, ry);
    c.closePath();
    c.fill();
    c.stroke();
    seg(c, rx, ry, rx + dir * h * 0.06, ry + h * 0.16, h * 0.05, col.breeches);
    c.fillStyle = col.skin;
    c.beginPath();
    c.arc(rx, ry - h * 0.35, h * 0.065, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    if (col.hat) {
      c.fillStyle = col.hat;
      c.beginPath();
      c.ellipse(rx, ry - h * 0.41, h * 0.1, h * 0.03, 0, 0, Math.PI * 2);
      c.fill();
      c.fillRect(rx - h * 0.05, ry - h * 0.48, h * 0.1, h * 0.07);
    }
  }
  c.restore();
}

/** A covered wagon behind an ox, wheels turning, a carter walking alongside. */
export function drawWagon(
  c: C,
  x: number,
  y: number,
  h: number,
  phase: number,
  dir: number,
  col: FigureColors,
): void {
  c.save();
  const wx = x - dir * h * 0.45;
  c.fillStyle = "rgba(30,20,10,0.28)";
  c.beginPath();
  c.ellipse(wx, y + 0.5, h * 0.5, h * 0.06, 0, 0, Math.PI * 2);
  c.fill();
  // Bed and canvas.
  c.fillStyle = "#7a5a36";
  c.strokeStyle = INK;
  c.lineWidth = Math.max(0.8, h * 0.02);
  c.beginPath();
  c.rect(wx - h * 0.42, y - h * 0.42, h * 0.84, h * 0.16);
  c.fill();
  c.stroke();
  c.fillStyle = "#efe6cf";
  c.beginPath();
  c.moveTo(wx - h * 0.4, y - h * 0.42);
  c.quadraticCurveTo(wx - h * 0.38, y - h * 0.8, wx, y - h * 0.8);
  c.quadraticCurveTo(wx + h * 0.38, y - h * 0.8, wx + h * 0.4, y - h * 0.42);
  c.closePath();
  c.fill();
  c.stroke();
  // Wheels, turning.
  for (const off of [-0.27, 0.27]) {
    const cx = wx + off * h;
    const cy = y - h * 0.15;
    const r = h * 0.15;
    c.strokeStyle = INK;
    c.lineWidth = Math.max(1, h * 0.03);
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.stroke();
    for (let k = 0; k < 3; k++) {
      const a = phase * 0.6 * dir + (k * Math.PI) / 3;
      seg(
        c,
        cx - Math.cos(a) * r,
        cy - Math.sin(a) * r,
        cx + Math.cos(a) * r,
        cy + Math.sin(a) * r,
        h * 0.015,
        "#3a2a1a",
      );
    }
  }
  c.restore();
  // The ox.
  drawRider(
    c,
    x + dir * h * 0.25,
    y,
    h * 0.8,
    phase,
    dir,
    col,
    "#8a6a48",
    false,
  );
  // The carter.
  drawWalker(c, x + dir * h * 0.05, y + 1, h * 0.75, phase + 0.8, dir, col, {
    carry: "staff",
  });
}

/** A pack horse or two with bundles, and a drover. */
export function drawPackTrain(
  c: C,
  x: number,
  y: number,
  h: number,
  phase: number,
  dir: number,
  col: FigureColors,
  native: boolean,
): void {
  for (const [k, off] of [
    [1, -0.7],
    [0, 0],
  ] as const) {
    const px = x - dir * h * 0.75 * (k + 0.2) + off;
    drawRider(
      c,
      px,
      y,
      h * 0.75,
      phase + k * 1.4,
      dir,
      col,
      k ? "#7a5a3a" : "#5a4028",
      false,
    );
    c.fillStyle = native ? "#a07a50" : "#c9b48a";
    c.strokeStyle = INK;
    c.lineWidth = 0.8;
    c.beginPath();
    c.roundRect(px - h * 0.17, y - h * 0.62, h * 0.3, h * 0.16, h * 0.04);
    c.fill();
    c.stroke();
  }
  drawWalker(c, x + dir * h * 0.35, y + 1, h * 0.85, phase + 0.5, dir, col, {
    native,
    carry: "staff",
  });
}

/** Two or three head of cattle, plodding. */
export function drawCattle(
  c: C,
  x: number,
  y: number,
  h: number,
  phase: number,
  dir: number,
): void {
  for (let k = 0; k < 2; k++)
    drawRider(
      c,
      x - dir * h * 0.55 * (k + 1),
      y + k,
      h * 0.6,
      phase + k * 2.1,
      dir,
      { coat: "", breeches: "", hat: null, skin: "", hair: "" },
      k ? "#5a3e28" : "#8a6a48",
      false,
    );
}

/** A canoe with paddlers, paddles dipping. */
export function drawCanoe(
  c: C,
  x: number,
  y: number,
  h: number,
  phase: number,
  dir: number,
  col: FigureColors,
): void {
  const bob = Math.sin(phase * 0.5) * h * 0.03;
  c.save();
  c.translate(x, y + bob);
  // Ripples.
  c.strokeStyle = "rgba(235,245,245,0.5)";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(-dir * h * 0.6, h * 0.02);
  c.quadraticCurveTo(-dir * h * 0.9, h * 0.05, -dir * h * 1.2, h * 0.02);
  c.stroke();
  c.fillStyle = "#8a5a2a";
  c.strokeStyle = INK;
  c.lineWidth = Math.max(0.8, h * 0.025);
  c.beginPath();
  c.moveTo(-h * 0.6, -h * 0.12);
  c.quadraticCurveTo(0, h * 0.12, h * 0.6, -h * 0.12);
  c.quadraticCurveTo(h * 0.3, -h * 0.02, 0, -h * 0.02);
  c.quadraticCurveTo(-h * 0.3, -h * 0.02, -h * 0.6, -h * 0.12);
  c.closePath();
  c.fill();
  c.stroke();
  for (const [k, px] of [
    [0, -0.22],
    [1, 0.22],
  ] as const) {
    const bx = px * h;
    c.fillStyle = col.coat;
    c.beginPath();
    c.moveTo(bx - h * 0.06, -h * 0.05);
    c.lineTo(bx + h * 0.06, -h * 0.05);
    c.lineTo(bx + h * 0.04, -h * 0.28);
    c.lineTo(bx - h * 0.04, -h * 0.28);
    c.closePath();
    c.fill();
    c.fillStyle = col.skin;
    c.beginPath();
    c.arc(bx, -h * 0.34, h * 0.06, 0, Math.PI * 2);
    c.fill();
    const stroke = Math.sin(phase + k * 0.6);
    const ax = bx + dir * h * 0.18 * stroke;
    seg(c, bx + dir * h * 0.02, -h * 0.26, ax, h * 0.08, h * 0.025, "#5a3e22");
  }
  c.restore();
}

/** A small ship under sail: pitching, bobbing, sails bellied, pennant flying, a wake. */
export function drawSloop(
  c: C,
  x: number,
  y: number,
  h: number,
  t: number,
  dir: number,
  pennant: string,
  moving = true,
): void {
  const bob = Math.sin(t / 650 + x * 0.03) * h * 0.04;
  const pitch = Math.sin(t / 900 + x * 0.05) * 0.06;
  c.save();
  // The wake: trailing arcs that fade.
  if (moving) {
    for (let k = 1; k <= 4; k++) {
      const a = 0.5 - k * 0.1;
      c.strokeStyle = `rgba(240,248,248,${a.toFixed(2)})`;
      c.lineWidth = 1.2;
      const back = -dir * (h * 0.35 + k * h * 0.22);
      const spread = h * 0.05 * k;
      c.beginPath();
      c.moveTo(back + x, y + bob - spread * 0.2);
      c.quadraticCurveTo(
        back + x - dir * h * 0.1,
        y + bob + spread * 0.5,
        back + x - dir * h * 0.2,
        y + bob + spread,
      );
      c.stroke();
    }
  }
  c.translate(x, y + bob);
  c.rotate(pitch);
  // Hull.
  c.fillStyle = "#5a3a22";
  c.strokeStyle = INK;
  c.lineWidth = Math.max(0.8, h * 0.025);
  c.beginPath();
  c.moveTo(-h * 0.5, -h * 0.12);
  c.lineTo(h * 0.5, -h * 0.12);
  c.lineTo(dir > 0 ? h * 0.62 : h * 0.4, -h * 0.2);
  c.quadraticCurveTo(h * 0.35, h * 0.08, 0, h * 0.08);
  c.quadraticCurveTo(
    -h * 0.35,
    h * 0.08,
    dir > 0 ? -h * 0.4 : -h * 0.62,
    -h * 0.2,
  );
  c.closePath();
  c.fill();
  c.stroke();
  seg(c, -h * 0.45, -h * 0.07, h * 0.45, -h * 0.07, h * 0.02, "#c9a24a");
  // Masts and sails, bellied the way she goes.
  const belly = dir * h * (0.1 + Math.sin(t / 700) * 0.02);
  for (const [mx, top, w] of [
    [-0.12, 0.95, 0.34],
    [0.2, 0.75, 0.26],
  ] as const) {
    const px = mx * h * dir;
    seg(c, px, -h * 0.12, px, -h * top, h * 0.025, "#3a2a1a");
    c.fillStyle = "#f2ead8";
    c.strokeStyle = INK;
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(px - w * h * 0.5, -h * (top - 0.08));
    c.quadraticCurveTo(
      px + belly,
      -h * (top - 0.25),
      px + w * h * 0.5,
      -h * (top - 0.08),
    );
    c.lineTo(px + w * h * 0.45, -h * 0.25);
    c.quadraticCurveTo(
      px + belly * 0.8,
      -h * 0.18,
      px - w * h * 0.45,
      -h * 0.25,
    );
    c.closePath();
    c.fill();
    c.stroke();
  }
  // Pennant.
  const px = -0.12 * h * dir;
  const flap = Math.sin(t / 180) * h * 0.04;
  c.fillStyle = pennant;
  c.beginPath();
  c.moveTo(px, -h * 0.95);
  c.quadraticCurveTo(
    px - dir * h * 0.15,
    -h * 0.97 + flap,
    px - dir * h * 0.32,
    -h * 0.92,
  );
  c.lineTo(px, -h * 0.87);
  c.closePath();
  c.fill();
  c.restore();
}
