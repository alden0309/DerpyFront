// MAP (r12): the harbour marks on the chart, drawn as the old chart-makers
// marked a road or a haven: a wooden pier run out from the shore to where
// boats tie up, a stone quay with piers for a real port, canoes drawn up on
// the beach below a village, and an anchor where ships may lie off an
// empty shore. Drawn in screen pixels from the landing (on the shore) to
// the moorings (on the water).

type C = CanvasRenderingContext2D;

export type HarbourKind = "anchorage" | "landing" | "pier" | "quay" | "port";

const INK = "rgba(38,24,12,0.9)";
const TIMBER = "#7a5634";
const TIMBER_DARK = "#4e3520";
const STONE = "#b9ad97";

/**
 * A harbour mark. (lx, ly) is the landing, (hx, hy) the moorings; `size`
 * is about how big the mark is (pixels). `frozen`: ice locks the harbour.
 */
export function harbourMark(
  c: C,
  lx: number,
  ly: number,
  hx: number,
  hy: number,
  kind: HarbourKind,
  size: number,
  frozen = false,
): void {
  let dx = hx - lx;
  let dy = hy - ly;
  let len = Math.hypot(dx, dy);
  if (len < 0.5) {
    dx = 0;
    dy = 1;
    len = 1;
  }
  const ux = dx / len;
  const uy = dy / len;
  // Across the pier.
  const nx = -uy;
  const ny = ux;
  c.save();
  c.lineCap = "round";
  c.lineJoin = "round";
  switch (kind) {
    case "anchorage":
      anchorMark(c, hx, hy, size * 0.75);
      break;
    case "landing":
      // Canoes drawn up on the shore, bows to the water.
      for (const side of [-1, 1]) {
        const cx = lx + nx * side * size * 0.32 + ux * size * 0.1;
        const cy = ly + ny * side * size * 0.32 + uy * size * 0.1;
        canoeHull(c, cx, cy, ux, uy, size * 0.75);
      }
      break;
    case "pier":
      pier(c, lx, ly, ux, uy, Math.max(len, size * 0.9), size * 0.22);
      break;
    case "quay":
    case "port": {
      // A stone quay along the shore, piers run out from it.
      const qw = size * (kind === "port" ? 1.1 : 0.8);
      const qx0 = lx - nx * qw;
      const qy0 = ly - ny * qw;
      const qx1 = lx + nx * qw;
      const qy1 = ly + ny * qw;
      c.strokeStyle = "rgba(40,28,16,0.85)";
      c.lineWidth = size * 0.34;
      c.beginPath();
      c.moveTo(qx0, qy0);
      c.lineTo(qx1, qy1);
      c.stroke();
      c.strokeStyle = STONE;
      c.lineWidth = size * 0.22;
      c.stroke();
      // The joints of the stones.
      c.strokeStyle = "rgba(60,46,30,0.55)";
      c.lineWidth = 0.6;
      c.beginPath();
      const joints = Math.max(2, Math.round(qw / 2.5));
      for (let k = 1; k < joints * 2; k++) {
        const f = k / (joints * 2);
        const jx = qx0 + (qx1 - qx0) * f;
        const jy = qy0 + (qy1 - qy0) * f;
        c.moveTo(jx - ux * size * 0.1, jy - uy * size * 0.1);
        c.lineTo(jx + ux * size * 0.1, jy + uy * size * 0.1);
      }
      c.stroke();
      const piers = kind === "port" ? [-0.7, 0, 0.7] : [-0.5, 0.5];
      for (const f of piers) {
        const px = lx + nx * qw * f;
        const py = ly + ny * qw * f;
        const l = Math.max(len, size) * (f === 0 ? 1 : 0.8);
        pier(c, px, py, ux, uy, l, size * 0.2);
      }
      if (kind === "port") {
        // A crane on the quay, for the big ships' cargo.
        const cx = qx1 - nx * size * 0.2;
        const cy = qy1 - ny * size * 0.2;
        c.strokeStyle = TIMBER_DARK;
        c.lineWidth = Math.max(1, size * 0.08);
        c.beginPath();
        c.moveTo(cx, cy);
        c.lineTo(cx, cy - size * 0.75);
        c.lineTo(cx + ux * size * 0.45, cy - size * 0.75 + uy * size * 0.45);
        c.stroke();
        c.lineWidth = 0.6;
        c.beginPath();
        c.moveTo(cx + ux * size * 0.45, cy - size * 0.75 + uy * size * 0.45);
        c.lineTo(cx + ux * size * 0.45, cy - size * 0.35 + uy * size * 0.45);
        c.stroke();
      }
      break;
    }
  }
  if (frozen) ice(c, hx, hy, size);
  c.restore();
}

/** A timber pier: a deck of planks on pilings, from (x, y) out along (ux, uy). */
function pier(
  c: C,
  x: number,
  y: number,
  ux: number,
  uy: number,
  len: number,
  width: number,
): void {
  const nx = -uy;
  const ny = ux;
  const ex = x + ux * len;
  const ey = y + uy * len;
  const w = Math.max(1.6, width);
  // The deck, outlined.
  c.strokeStyle = INK;
  c.lineWidth = w + 1.4;
  c.lineCap = "butt";
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(ex, ey);
  c.stroke();
  c.strokeStyle = TIMBER;
  c.lineWidth = w;
  c.stroke();
  // Planks across it.
  c.strokeStyle = TIMBER_DARK;
  c.lineWidth = 0.6;
  c.beginPath();
  const step = Math.max(1.6, w * 0.9);
  for (let d = step; d < len; d += step) {
    const px = x + ux * d;
    const py = y + uy * d;
    c.moveTo(px - (nx * w) / 2, py - (ny * w) / 2);
    c.lineTo(px + (nx * w) / 2, py + (ny * w) / 2);
  }
  c.stroke();
  // Pilings down both sides, and a T-head where the boats tie up.
  c.fillStyle = TIMBER_DARK;
  for (let d = step * 1.5; d < len; d += step * 2.5)
    for (const side of [-1, 1]) {
      c.beginPath();
      c.arc(
        x + ux * d + (nx * side * (w + 1.2)) / 2,
        y + uy * d + (ny * side * (w + 1.2)) / 2,
        Math.max(0.6, w * 0.22),
        0,
        Math.PI * 2,
      );
      c.fill();
    }
  c.strokeStyle = INK;
  c.lineWidth = w * 0.9 + 1;
  c.beginPath();
  c.moveTo(ex - nx * w * 1.3, ey - ny * w * 1.3);
  c.lineTo(ex + nx * w * 1.3, ey + ny * w * 1.3);
  c.stroke();
  c.strokeStyle = TIMBER;
  c.lineWidth = w * 0.9;
  c.stroke();
  c.lineCap = "round";
}

/** A canoe drawn up on the beach, its bow along (ux, uy). */
function canoeHull(
  c: C,
  x: number,
  y: number,
  ux: number,
  uy: number,
  len: number,
): void {
  const a = Math.atan2(uy, ux);
  c.save();
  c.translate(x, y);
  c.rotate(a);
  c.fillStyle = "#8a5a2a";
  c.strokeStyle = INK;
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(-len * 0.5, 0);
  c.quadraticCurveTo(0, len * 0.22, len * 0.5, 0);
  c.quadraticCurveTo(0, -len * 0.12, -len * 0.5, 0);
  c.closePath();
  c.fill();
  c.stroke();
  c.restore();
}

/** An anchor, as charts mark a road where ships may lie. */
function anchorMark(c: C, x: number, y: number, s: number): void {
  const k = Math.max(5, s) / 9;
  c.strokeStyle = "rgba(225,238,240,0.9)";
  c.lineWidth = 3 * k;
  const draw = () => {
    c.beginPath();
    c.arc(x, y - 4.5 * k, 1.6 * k, 0, Math.PI * 2);
    c.moveTo(x, y - 3 * k);
    c.lineTo(x, y + 4 * k);
    c.moveTo(x - 3 * k, y - 1.5 * k);
    c.lineTo(x + 3 * k, y - 1.5 * k);
    c.moveTo(x - 4.5 * k, y + 1 * k);
    c.quadraticCurveTo(x - 3.5 * k, y + 4.5 * k, x, y + 4 * k);
    c.quadraticCurveTo(x + 3.5 * k, y + 4.5 * k, x + 4.5 * k, y + 1 * k);
    c.stroke();
  };
  draw();
  c.strokeStyle = "#1f3f4c";
  c.lineWidth = 1.3 * k;
  draw();
}

/** Ice locking a harbour: pale floes on the water round the moorings. */
function ice(c: C, x: number, y: number, size: number): void {
  c.fillStyle = "rgba(236,244,248,0.85)";
  c.strokeStyle = "rgba(120,150,170,0.7)";
  c.lineWidth = 0.6;
  const floes: [number, number, number][] = [
    [0, 0, 0.55],
    [0.7, 0.25, 0.35],
    [-0.65, 0.3, 0.4],
    [0.2, -0.55, 0.3],
    [-0.3, 0.7, 0.28],
  ];
  for (const [fx, fy, r] of floes) {
    const cx = x + fx * size;
    const cy = y + fy * size * 0.6;
    const rr = r * size * 0.55;
    c.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + fx;
      const d = rr * (0.75 + 0.25 * Math.sin(k * 2.3 + fy * 7));
      const px = cx + Math.cos(a) * d;
      const py = cy + Math.sin(a) * d * 0.6;
      if (k === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
    c.fill();
    c.stroke();
  }
}
