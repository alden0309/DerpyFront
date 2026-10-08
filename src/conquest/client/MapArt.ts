// Little pictures drawn on the map: soldiers for each kind of regiment,
// ships under sail, explorers on the trail, palisades, and the marks an old
// chart picks up (a compass rose, a coffee ring, notes in the margin).
// Everything is drawn in screen pixels at (x, y), standing on that point.

import type { RegType } from "../engine/Types";

type C = CanvasRenderingContext2D;

const INK = "#2b1d12";
const SKIN = "#e2b48f";
const NATIVE_SKIN = "#a8693f";
const CREAM = "#f4ead0";

function shadow(c: C, x: number, y: number, w: number): void {
  c.fillStyle = "rgba(20,14,8,0.28)";
  c.beginPath();
  c.ellipse(x, y + 0.5, w, w * 0.32, 0, 0, Math.PI * 2);
  c.fill();
}

function legs(
  c: C,
  x: number,
  y: number,
  h: number,
  step: number,
  color = INK,
): void {
  c.strokeStyle = color;
  c.lineWidth = h * 0.09;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(x - h * 0.06, y - h * 0.38);
  c.lineTo(x - h * 0.08 - step, y);
  c.moveTo(x + h * 0.06, y - h * 0.38);
  c.lineTo(x + h * 0.08 + step, y);
  c.stroke();
}

function head(c: C, x: number, y: number, r: number, skin: string): void {
  c.fillStyle = skin;
  c.strokeStyle = INK;
  c.lineWidth = Math.max(0.8, r * 0.25);
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.stroke();
}

function broadHat(
  c: C,
  x: number,
  y: number,
  r: number,
  color: string,
  plume?: string,
): void {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y - r * 0.55, r * 1.7, r * 0.42, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.ellipse(x, y - r * 1.05, r * 0.9, r * 0.65, 0, Math.PI, 0);
  c.fill();
  if (plume) {
    c.strokeStyle = plume;
    c.lineWidth = r * 0.45;
    c.beginPath();
    c.moveTo(x + r * 0.5, y - r * 1.2);
    c.quadraticCurveTo(x + r * 1.8, y - r * 2.1, x + r * 2.1, y - r * 0.9);
    c.stroke();
  }
}

function coat(c: C, x: number, y: number, h: number, color: string): void {
  c.fillStyle = color;
  c.strokeStyle = INK;
  c.lineWidth = Math.max(0.8, h * 0.05);
  c.beginPath();
  c.moveTo(x - h * 0.18, y - h * 0.36);
  c.lineTo(x - h * 0.15, y - h * 0.74);
  c.quadraticCurveTo(x, y - h * 0.82, x + h * 0.15, y - h * 0.74);
  c.lineTo(x + h * 0.18, y - h * 0.36);
  c.closePath();
  c.fill();
  c.stroke();
}

function musket(
  c: C,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
): void {
  c.strokeStyle = "#5a3a1e";
  c.lineWidth = w;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
  c.strokeStyle = "#8f8a84";
  c.lineWidth = w * 0.6;
  c.beginPath();
  c.moveTo(x0 + (x1 - x0) * 0.45, y0 + (y1 - y0) * 0.45);
  c.lineTo(x1, y1);
  c.stroke();
}

function horse(
  c: C,
  x: number,
  y: number,
  h: number,
  step: number,
  coatColor: string,
  patch?: string,
): void {
  const bodyY = y - h * 0.42;
  c.strokeStyle = INK;
  c.lineWidth = h * 0.07;
  c.lineCap = "round";
  // Legs.
  c.beginPath();
  for (const [lx, s] of [
    [-0.32, step],
    [-0.2, -step],
    [0.22, -step],
    [0.34, step],
  ] as const) {
    c.moveTo(x + h * lx, bodyY + h * 0.08);
    c.lineTo(x + h * lx + s, y);
  }
  c.stroke();
  // Body, neck, head.
  c.fillStyle = coatColor;
  c.lineWidth = Math.max(0.8, h * 0.045);
  c.beginPath();
  c.ellipse(x, bodyY, h * 0.42, h * 0.17, 0, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  if (patch) {
    c.fillStyle = patch;
    c.beginPath();
    c.ellipse(
      x - h * 0.1,
      bodyY - h * 0.02,
      h * 0.14,
      h * 0.09,
      0.3,
      0,
      Math.PI * 2,
    );
    c.fill();
  }
  c.fillStyle = coatColor;
  c.beginPath();
  c.moveTo(x + h * 0.3, bodyY - h * 0.06);
  c.lineTo(x + h * 0.48, bodyY - h * 0.36);
  c.lineTo(x + h * 0.62, bodyY - h * 0.3);
  c.lineTo(x + h * 0.44, bodyY + h * 0.02);
  c.closePath();
  c.fill();
  c.stroke();
  // Tail.
  c.beginPath();
  c.moveTo(x - h * 0.4, bodyY - h * 0.05);
  c.quadraticCurveTo(
    x - h * 0.6,
    bodyY + h * 0.05,
    x - h * 0.52,
    bodyY + h * 0.25,
  );
  c.stroke();
}

/**
 * A soldier standing for a regiment type, in the nation's colour, facing
 * `dir` (1 right, −1 left), with `step` (−1..1) swinging the legs.
 */
export function soldier(
  c: C,
  x: number,
  y: number,
  h: number,
  type: RegType,
  color: string,
  dir: number,
  step: number,
): void {
  c.save();
  c.translate(x, y);
  c.scale(dir, 1);
  const st = step * h * 0.1;
  switch (type) {
    case "militia": {
      shadow(c, 0, 0, h * 0.28);
      legs(c, 0, 0, h, st);
      coat(c, 0, 0, h, "#7a5b3a");
      c.fillStyle = color;
      c.fillRect(-h * 0.17, -h * 0.5, h * 0.34, h * 0.06);
      head(c, 0, -h * 0.86, h * 0.1, SKIN);
      broadHat(c, 0, -h * 0.86, h * 0.1, "#3a2a1a");
      musket(c, h * 0.16, -h * 0.4, h * 0.36, -h * 1.02, h * 0.06);
      break;
    }
    case "regulars": {
      shadow(c, 0, 0, h * 0.28);
      legs(c, 0, 0, h, st);
      coat(c, 0, 0, h, color);
      c.strokeStyle = CREAM;
      c.lineWidth = h * 0.045;
      c.beginPath();
      c.moveTo(-h * 0.14, -h * 0.72);
      c.lineTo(h * 0.14, -h * 0.4);
      c.stroke();
      head(c, 0, -h * 0.86, h * 0.1, SKIN);
      broadHat(c, 0, -h * 0.86, h * 0.1, "#1e1712", CREAM);
      musket(c, -h * 0.02, -h * 0.5, h * 0.22, -h * 1.12, h * 0.06);
      break;
    }
    case "dragoons": {
      shadow(c, 0, 0, h * 0.42);
      horse(c, 0, 0, h, st, "#6b4423");
      coat(c, -h * 0.02, -h * 0.42, h * 0.75, color);
      head(c, -h * 0.02, -h * 1.06, h * 0.085, SKIN);
      broadHat(c, -h * 0.02, -h * 1.06, h * 0.085, "#1e1712", CREAM);
      musket(c, h * 0.1, -h * 0.74, h * 0.34, -h * 1.2, h * 0.05);
      break;
    }
    case "artillery": {
      shadow(c, 0, 0, h * 0.4);
      // Barrel, cocked up.
      c.save();
      c.translate(h * 0.02, -h * 0.34);
      c.rotate(-0.32);
      c.fillStyle = "#3a3634";
      c.strokeStyle = INK;
      c.lineWidth = Math.max(0.8, h * 0.04);
      c.beginPath();
      c.roundRect(-h * 0.36, -h * 0.08, h * 0.74, h * 0.16, h * 0.06);
      c.fill();
      c.stroke();
      c.restore();
      // Carriage and wheel.
      c.fillStyle = "#6b4a2a";
      c.fillRect(-h * 0.34, -h * 0.26, h * 0.42, h * 0.1);
      c.strokeStyle = INK;
      c.lineWidth = Math.max(1, h * 0.06);
      c.beginPath();
      c.arc(-h * 0.12, -h * 0.17, h * 0.17, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 4 + step * 0.4;
        c.moveTo(
          -h * 0.12 + Math.cos(a) * h * 0.17,
          -h * 0.17 + Math.sin(a) * h * 0.17,
        );
        c.lineTo(
          -h * 0.12 - Math.cos(a) * h * 0.17,
          -h * 0.17 - Math.sin(a) * h * 0.17,
        );
      }
      c.lineWidth = Math.max(0.6, h * 0.03);
      c.stroke();
      // A pennant in the nation's colour.
      pennant(c, -h * 0.34, -h * 0.26, h * 0.6, color);
      break;
    }
    case "warriors": {
      shadow(c, 0, 0, h * 0.28);
      legs(c, 0, 0, h, st, "#5a3a22");
      c.fillStyle = NATIVE_SKIN;
      c.strokeStyle = INK;
      c.lineWidth = Math.max(0.8, h * 0.05);
      c.beginPath();
      c.moveTo(-h * 0.15, -h * 0.38);
      c.lineTo(-h * 0.14, -h * 0.74);
      c.quadraticCurveTo(0, -h * 0.8, h * 0.14, -h * 0.74);
      c.lineTo(h * 0.15, -h * 0.38);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = color;
      c.fillRect(-h * 0.16, -h * 0.44, h * 0.32, h * 0.08);
      head(c, 0, -h * 0.86, h * 0.1, NATIVE_SKIN);
      c.fillStyle = "#1b1410";
      c.beginPath();
      c.ellipse(0, -h * 0.93, h * 0.11, h * 0.06, 0, Math.PI, 0);
      c.fill();
      // Feather.
      c.fillStyle = CREAM;
      c.beginPath();
      c.ellipse(-h * 0.07, -h * 1.03, h * 0.03, h * 0.1, -0.4, 0, Math.PI * 2);
      c.fill();
      // Bow.
      c.strokeStyle = "#5a3a1e";
      c.lineWidth = h * 0.05;
      c.beginPath();
      c.arc(h * 0.2, -h * 0.62, h * 0.3, -1.2, 1.2);
      c.stroke();
      c.strokeStyle = "rgba(43,29,18,0.7)";
      c.lineWidth = h * 0.02;
      c.beginPath();
      c.moveTo(
        h * 0.2 + Math.cos(-1.2) * h * 0.3,
        -h * 0.62 + Math.sin(-1.2) * h * 0.3,
      );
      c.lineTo(
        h * 0.2 + Math.cos(1.2) * h * 0.3,
        -h * 0.62 + Math.sin(1.2) * h * 0.3,
      );
      c.stroke();
      break;
    }
    case "riders": {
      shadow(c, 0, 0, h * 0.42);
      horse(c, 0, 0, h, st, "#c9b28f", "#5a3a22");
      c.fillStyle = NATIVE_SKIN;
      c.strokeStyle = INK;
      c.lineWidth = Math.max(0.8, h * 0.04);
      c.beginPath();
      c.moveTo(-h * 0.13, -h * 0.5);
      c.lineTo(-h * 0.11, -h * 0.84);
      c.quadraticCurveTo(0, -h * 0.9, h * 0.11, -h * 0.84);
      c.lineTo(h * 0.13, -h * 0.5);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = color;
      c.fillRect(-h * 0.13, -h * 0.58, h * 0.26, h * 0.07);
      head(c, 0, -h * 0.98, h * 0.09, NATIVE_SKIN);
      c.fillStyle = CREAM;
      c.beginPath();
      c.ellipse(-h * 0.06, -h * 1.12, h * 0.03, h * 0.1, -0.4, 0, Math.PI * 2);
      c.fill();
      // Lance.
      c.strokeStyle = "#5a3a1e";
      c.lineWidth = h * 0.04;
      c.beginPath();
      c.moveTo(-h * 0.2, -h * 0.5);
      c.lineTo(h * 0.5, -h * 1.25);
      c.stroke();
      break;
    }
  }
  c.restore();
}

function pennant(c: C, x: number, y: number, h: number, color: string): void {
  c.strokeStyle = INK;
  c.lineWidth = Math.max(0.8, h * 0.05);
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x, y - h);
  c.stroke();
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x, y - h);
  c.lineTo(x + h * 0.55, y - h * 0.85);
  c.lineTo(x, y - h * 0.7);
  c.closePath();
  c.fill();
  c.stroke();
}

/** A ship under sail, its bow pointing along `angle`, flying a nation's colour. */
export function ship(
  c: C,
  x: number,
  y: number,
  size: number,
  angle: number,
  color: string,
  t: number,
): void {
  c.save();
  c.translate(x, y);
  const facingLeft = Math.cos(angle) < 0;
  // Wake.
  c.strokeStyle = "rgba(235,245,245,0.55)";
  c.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const d = size * (0.7 + i * 0.45);
    c.beginPath();
    c.arc(
      -Math.cos(angle) * d,
      -Math.sin(angle) * d + size * 0.18,
      size * 0.12 * i,
      0,
      Math.PI * 2,
    );
    c.globalAlpha = 0.5 / i;
    c.stroke();
  }
  c.globalAlpha = 1;
  if (facingLeft) c.scale(-1, 1);
  const bob = Math.sin(t / 380) * size * 0.04;
  c.translate(0, bob);
  // Hull.
  c.fillStyle = "#5a3a22";
  c.strokeStyle = INK;
  c.lineWidth = Math.max(0.8, size * 0.06);
  c.beginPath();
  c.moveTo(-size * 0.62, -size * 0.08);
  c.lineTo(size * 0.7, -size * 0.12);
  c.quadraticCurveTo(size * 0.5, size * 0.22, size * 0.32, size * 0.24);
  c.lineTo(-size * 0.42, size * 0.24);
  c.quadraticCurveTo(-size * 0.62, size * 0.1, -size * 0.62, -size * 0.08);
  c.closePath();
  c.fill();
  c.stroke();
  // Masts and sails.
  c.fillStyle = CREAM;
  for (const [mx, mh] of [
    [-size * 0.22, size * 0.8],
    [size * 0.18, size * 0.95],
  ] as const) {
    c.beginPath();
    c.moveTo(mx, -size * 0.1);
    c.lineTo(mx, -size * 0.1 - mh);
    c.stroke();
    c.beginPath();
    c.moveTo(mx - size * 0.2, -size * 0.18 - mh * 0.15);
    c.quadraticCurveTo(
      mx + size * 0.08,
      -size * 0.1 - mh * 0.5,
      mx - size * 0.18,
      -size * 0.12 - mh * 0.85,
    );
    c.lineTo(mx + size * 0.16, -size * 0.12 - mh * 0.85);
    c.quadraticCurveTo(
      mx + size * 0.34,
      -size * 0.1 - mh * 0.5,
      mx + size * 0.18,
      -size * 0.18 - mh * 0.15,
    );
    c.closePath();
    c.fill();
    c.stroke();
  }
  // Flag.
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(size * 0.18, -size * 1.05);
  c.lineTo(size * 0.48, -size * 0.98);
  c.lineTo(size * 0.18, -size * 0.9);
  c.closePath();
  c.fill();
  c.stroke();
  c.restore();
}

/** An explorer on the trail: pack, staff, and a cap in the nation's colour. */
export function explorer(
  c: C,
  x: number,
  y: number,
  h: number,
  color: string,
  dir: number,
  step: number,
): void {
  c.save();
  c.translate(x, y);
  c.scale(dir, 1);
  shadow(c, 0, 0, h * 0.26);
  legs(c, 0, 0, h, step * h * 0.1);
  coat(c, 0, 0, h, "#6e5a3c");
  c.fillStyle = "#8a6a3e";
  c.strokeStyle = INK;
  c.lineWidth = Math.max(0.8, h * 0.05);
  c.beginPath();
  c.roundRect(-h * 0.3, -h * 0.74, h * 0.16, h * 0.3, h * 0.04);
  c.fill();
  c.stroke();
  head(c, 0, -h * 0.86, h * 0.1, SKIN);
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(0, -h * 0.95, h * 0.11, h * 0.06, 0, Math.PI, 0);
  c.fill();
  c.strokeStyle = "#5a3a1e";
  c.lineWidth = h * 0.05;
  c.beginPath();
  c.moveTo(h * 0.2, 0);
  c.lineTo(h * 0.26, -h * 1.0);
  c.stroke();
  c.restore();
}

/** A palisade of stakes with a flag: an outpost. */
export function palisade(
  c: C,
  x: number,
  y: number,
  s: number,
  color: string,
): void {
  c.save();
  c.translate(x, y);
  c.fillStyle = "#7a5634";
  c.strokeStyle = INK;
  c.lineWidth = Math.max(0.8, s * 0.06);
  for (let i = -2; i <= 2; i++) {
    const px = i * s * 0.22;
    c.beginPath();
    c.moveTo(px - s * 0.09, 0);
    c.lineTo(px - s * 0.09, -s * 0.55);
    c.lineTo(px, -s * 0.72);
    c.lineTo(px + s * 0.09, -s * 0.55);
    c.lineTo(px + s * 0.09, 0);
    c.closePath();
    c.fill();
    c.stroke();
  }
  pennant(c, 0, -s * 0.7, s * 0.7, color);
  c.restore();
}

/** A compass rose, inked, as on a 17th-century chart. */
export function compassRose(c: C, x: number, y: number, r: number): void {
  c.save();
  c.translate(x, y);
  c.strokeStyle = "rgba(43,29,18,0.55)";
  c.lineWidth = Math.max(0.6, r * 0.012);
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.moveTo(r * 0.9, 0);
  c.arc(0, 0, r * 0.9, 0, Math.PI * 2);
  c.stroke();
  for (let i = 0; i < 32; i++) {
    const a = (i * Math.PI) / 16;
    c.beginPath();
    c.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
    c.lineTo(
      Math.cos(a) * r * (i % 2 ? 0.86 : 0.8),
      Math.sin(a) * r * (i % 2 ? 0.86 : 0.8),
    );
    c.stroke();
  }
  const point = (a: number, len: number, w: number, dark: boolean) => {
    const ax = Math.cos(a);
    const ay = Math.sin(a);
    const px = -ay;
    const py = ax;
    for (const side of [1, -1]) {
      c.fillStyle =
        (side === 1) === dark ? "rgba(43,29,18,0.7)" : "rgba(244,234,208,0.85)";
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(ax * len, ay * len);
      c.lineTo(px * w * side, py * w * side);
      c.closePath();
      c.fill();
      c.stroke();
    }
  };
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    point(a, i % 2 ? r * 0.55 : r * 0.82, r * 0.1, true);
  }
  c.fillStyle = "rgba(122,32,22,0.8)";
  c.font = `${Math.round(r * 0.28)}px "IM Fell English SC", Georgia, serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("N", 0, -r * 1.15);
  c.restore();
}

/** The ring a coffee cup leaves on a chart, never quite closed. */
export function coffeeRing(c: C, x: number, y: number, r: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(0.6);
  for (const [rr, a0, a1, alpha, w] of [
    [r, 0.2, 5.9, 0.18, 0.09],
    [r * 0.96, 0.9, 4.4, 0.12, 0.05],
    [r * 1.02, 3.6, 6.1, 0.1, 0.04],
  ] as const) {
    c.strokeStyle = `rgba(120,78,38,${alpha})`;
    c.lineWidth = r * w;
    c.beginPath();
    c.ellipse(0, 0, rr, rr * 0.97, 0, a0, a1);
    c.stroke();
  }
  c.fillStyle = "rgba(140,96,52,0.05)";
  c.beginPath();
  c.ellipse(r * 0.05, 0, r * 0.94, r * 0.9, 0, 0, Math.PI * 2);
  c.fill();
  // A drip that ran.
  c.fillStyle = "rgba(120,78,38,0.12)";
  c.beginPath();
  c.ellipse(r * 1.1, r * 0.35, r * 0.08, r * 0.05, 0.5, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** A note in a clerk's hand, with a line drawn to the place it's about. */
export function marginNote(
  c: C,
  x: number,
  y: number,
  text: string,
  toX: number,
  toY: number,
): void {
  c.save();
  c.font = `italic 15px "IM Fell English", Georgia, serif`;
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  const w = c.measureText(text).width;
  c.strokeStyle = "rgba(122,32,22,0.8)";
  c.fillStyle = "rgba(122,32,22,0.92)";
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(x - 4, y - 5);
  c.quadraticCurveTo((x + toX) / 2 - 10, (y + toY) / 2 - 12, toX + 4, toY - 4);
  c.stroke();
  c.save();
  c.translate(x, y);
  c.rotate(-0.06);
  c.fillText(text, 0, 0);
  c.beginPath();
  c.moveTo(0, 4);
  c.bezierCurveTo(w * 0.3, 6, w * 0.6, 2, w + 4, 5);
  c.stroke();
  c.restore();
  c.restore();
}

// ---------------------------------------------------------------- glyphs for places

export function tent(c: C, x: number, y: number): void {
  c.fillStyle = "#3b2b1a";
  c.beginPath();
  c.moveTo(x - 4.5, y + 3.5);
  c.lineTo(x, y - 4);
  c.lineTo(x + 4.5, y + 3.5);
  c.closePath();
  c.fill();
}

export function swords(
  c: C,
  x: number,
  y: number,
  r: number,
  color: string,
): void {
  c.strokeStyle = color;
  c.lineWidth = Math.max(1.6, r / 3.5);
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(x - r, y - r);
  c.lineTo(x + r, y + r);
  c.moveTo(x + r, y - r);
  c.lineTo(x - r, y + r);
  c.moveTo(x - r * 0.9, y + r * 0.35);
  c.lineTo(x - r * 0.35, y + r * 0.9);
  c.moveTo(x + r * 0.9, y + r * 0.35);
  c.lineTo(x + r * 0.35, y + r * 0.9);
  c.stroke();
}

export function anchor(c: C, x: number, y: number): void {
  c.strokeStyle = "#1f3f4c";
  c.lineWidth = 1.6;
  c.beginPath();
  c.arc(x, y - 4.5, 1.6, 0, Math.PI * 2);
  c.moveTo(x, y - 3);
  c.lineTo(x, y + 4);
  c.moveTo(x - 3, y - 1.5);
  c.lineTo(x + 3, y - 1.5);
  c.moveTo(x - 4.5, y + 1);
  c.quadraticCurveTo(x - 3.5, y + 4.5, x, y + 4);
  c.quadraticCurveTo(x + 3.5, y + 4.5, x + 4.5, y + 1);
  c.stroke();
}

export function tower(c: C, x: number, y: number, level: number): void {
  c.fillStyle = "#4a3a2a";
  c.fillRect(x - 4, y - 3, 8, 7);
  for (let i = 0; i < 3; i++) c.fillRect(x - 4 + i * 3, y - 5.5, 2, 2.5);
  c.fillStyle = "#f4e9cd";
  c.font = "700 7px system-ui, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(String(level), x, y + 1);
}

export function flame(c: C, x: number, y: number): void {
  c.fillStyle = "#c2411f";
  c.beginPath();
  c.moveTo(x, y - 6);
  c.quadraticCurveTo(x + 5, y, x + 2.5, y + 4);
  c.quadraticCurveTo(x, y + 6, x - 2.5, y + 4);
  c.quadraticCurveTo(x - 5, y, x, y - 6);
  c.fill();
}

export function whiteFlag(c: C, x: number, y: number): void {
  c.strokeStyle = "#3b2b1a";
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(x, y + 12);
  c.lineTo(x, y);
  c.stroke();
  c.fillStyle = "#fbf6e8";
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + 8, y + 2.5);
  c.lineTo(x, y + 5);
  c.closePath();
  c.fill();
  c.stroke();
}

export function ring(
  c: C,
  x: number,
  y: number,
  r: number,
  color: string,
  frac: number,
): void {
  c.fillStyle = "rgba(255,250,235,0.88)";
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "rgba(0,0,0,0.25)";
  c.lineWidth = 3;
  c.stroke();
  c.strokeStyle = color;
  c.lineWidth = 3;
  c.beginPath();
  c.arc(
    x,
    y,
    r,
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, frac)),
  );
  c.stroke();
}

export function goodDot(c: C, x: number, y: number, color: string): void {
  c.fillStyle = color;
  c.strokeStyle = "rgba(40,28,18,0.8)";
  c.lineWidth = 1.2;
  c.beginPath();
  c.arc(x, y, 4.5, 0, Math.PI * 2);
  c.fill();
  c.stroke();
}

export function unknownMark(c: C, x: number, y: number): void {
  c.fillStyle = "rgba(43,29,18,0.55)";
  c.font = `italic 14px "IM Fell English", Georgia, serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("?", x, y);
}
