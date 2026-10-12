// SEA (r15): the hurricanes on the map, as the engine moves them (Storms.ts):
// each where its eye is now (carried on along its heading through the day,
// so it moves smoothly between the days' steps), as big as its winds reach,
// its track behind it fading out, and a faint dotted cone a day or two
// ahead for where it's heading. Cheap: a handful of storms at most, a few
// paths each.

import { moveAlong } from "../engine/SeaCore";
import { FADE_DAYS, stormReach } from "../engine/Storms";
import type { GameState } from "../engine/Types";
import { projectLatLon } from "./Harbours";

/** A storm to draw, in map units. */
export interface StormMark {
  id: number;
  x: number;
  y: number;
  /** The reach of its winds. */
  r: number;
  /** 0 to 1: how strongly it's drawn (it builds, and fades once blown out). */
  alpha: number;
  /** Where its eye has been, oldest first. */
  track: [number, number][];
  /** Where it's heading: a day and two days on. */
  ahead: [number, number][];
  force: number;
}

/** Km in a map unit at a latitude (the map's scale shrinks with the cosine). */
function kmPerUnit(lat: number, width: number): number {
  const cell = ((-46 - -168) * Math.PI) / 180 / width;
  return 6371 * cell * Math.max(0.2, Math.cos((lat * Math.PI) / 180));
}

/** The storms abroad at `dayNow` (fractional), for a map `width` units across. */
export function seaStorms(
  s: GameState,
  dayNow: number,
  width: number,
): StormMark[] {
  const list = s.sea?.storms;
  if (!list?.length) return [];
  const t = Math.max(0, Math.min(1, dayNow - s.day));
  const out: StormMark[] = [];
  for (const st of list) {
    const ended = st.ended !== undefined;
    const alpha = ended
      ? Math.max(0, 1 - (dayNow - st.ended!) / (FADE_DAYS + 1))
      : Math.min(1, 0.35 + (dayNow - st.born) * 0.65);
    if (alpha <= 0.02) continue;
    const [lat, lon] = ended
      ? [st.lat, st.lon]
      : moveAlong(st.lat, st.lon, st.dir, st.km * t);
    const [x, y] = projectLatLon(lat, lon, width);
    const k = kmPerUnit(lat, width);
    const force = ended ? Math.max(0.5, st.force) : Math.max(0.8, st.force);
    const r = (stormReach(force) * 0.85) / k;
    const track = [...st.track, [lat, lon] as [number, number]].map(
      ([a, b]) => projectLatLon(a, b, width) as [number, number],
    );
    const ahead: [number, number][] = [];
    if (!ended)
      for (const d of [1, 2]) {
        const [a, b] = moveAlong(lat, lon, st.dir, st.km * d);
        ahead.push(projectLatLon(a, b, width) as [number, number]);
      }
    out.push({ id: st.id, x, y, r, alpha, track, ahead, force });
  }
  return out;
}

/**
 * A storm's track (a fading line of where its eye has been) and its likely
 * way ahead (a faint dotted cone that widens with the days).
 */
export function drawStormWay(
  c: CanvasRenderingContext2D,
  m: StormMark,
  sx: (x: number) => number,
  sy: (y: number) => number,
  scale: number,
): void {
  c.save();
  c.lineCap = "round";
  // The track behind: older points fainter.
  const n = m.track.length;
  for (let i = 1; i < n; i++) {
    const [ax, ay] = m.track[i - 1];
    const [bx, by] = m.track[i];
    c.globalAlpha = m.alpha * (0.15 + (0.45 * i) / n);
    c.strokeStyle = "rgba(240,244,248,0.95)";
    c.lineWidth = Math.max(1.2, 2.2 * Math.min(1.6, scale));
    c.setLineDash([]);
    c.beginPath();
    c.moveTo(sx(ax), sy(ay));
    c.lineTo(sx(bx), sy(by));
    c.stroke();
  }
  // The way ahead: a dotted line and the cone of where it might go.
  if (m.ahead.length) {
    c.globalAlpha = m.alpha * 0.55;
    c.strokeStyle = "rgba(255,248,232,0.9)";
    c.lineWidth = Math.max(1, 1.4 * Math.min(1.6, scale));
    c.setLineDash([3, 5]);
    c.beginPath();
    c.moveTo(sx(m.x), sy(m.y));
    for (const [x, y] of m.ahead) c.lineTo(sx(x), sy(y));
    c.stroke();
    const [ex, ey] = m.ahead[m.ahead.length - 1];
    const dx = ex - m.x;
    const dy = ey - m.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const w = m.r * 0.9;
    c.setLineDash([]);
    c.globalAlpha = m.alpha * 0.12;
    c.fillStyle = "rgba(255,246,226,1)";
    c.beginPath();
    c.moveTo(sx(m.x + nx * m.r * 0.3), sy(m.y + ny * m.r * 0.3));
    c.lineTo(sx(ex + nx * w), sy(ey + ny * w));
    c.lineTo(sx(ex - nx * w), sy(ey - ny * w));
    c.lineTo(sx(m.x - nx * m.r * 0.3), sy(m.y - ny * m.r * 0.3));
    c.closePath();
    c.fill();
    // An arrowhead at the day-ahead mark.
    const [hx, hy] = m.ahead[0];
    const ux = (hx - m.x) / (Math.hypot(hx - m.x, hy - m.y) || 1);
    const uy = (hy - m.y) / (Math.hypot(hx - m.x, hy - m.y) || 1);
    const a = 5 / Math.max(0.5, scale);
    c.globalAlpha = m.alpha * 0.7;
    c.fillStyle = "rgba(255,248,232,0.95)";
    c.beginPath();
    c.moveTo(sx(hx + ux * a), sy(hy + uy * a));
    c.lineTo(sx(hx - ux * a + -uy * a * 0.7), sy(hy - uy * a + ux * a * 0.7));
    c.lineTo(sx(hx - ux * a - -uy * a * 0.7), sy(hy - uy * a - ux * a * 0.7));
    c.closePath();
    c.fill();
  }
  c.restore();
}
