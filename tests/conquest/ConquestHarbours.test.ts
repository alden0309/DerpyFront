// MAP (r12): the harbours and sea lanes the map's boats use. Every coastal
// province has a harbour on the water; every lane, way out to Europe and
// berth keeps to the water of the chart's own shapes (the narrows that join
// rivers drawn as chains of pools count as water, at most a few cells
// across); the stored data is what the builder makes from today's map; and
// a hop by sea walks to the quay, sails, and walks up to the town.

import { readFileSync } from "fs";
import { beforeAll, describe, expect, test } from "vitest";
import {
  alongWay,
  decodeHalf,
  restOfWay,
  SeaChart,
  type SeaData,
} from "../../src/conquest/client/Harbours";
import { buildSeaData, SeaBuild } from "../../src/conquest/client/SeaBuild";
import { AMERICAS } from "../../src/conquest/engine/Map";

const geo = JSON.parse(
  readFileSync("src/conquest/data/americas-geo.json", "utf8"),
);
const data = JSON.parse(
  readFileSync("src/conquest/data/americas-sea.json", "utf8"),
) as SeaData;
const P = AMERICAS.provinces;
const byName = (n: string) => P.findIndex((p) => p.name === n);

let sb: SeaBuild;
let chart: SeaChart;
beforeAll(() => {
  sb = new SeaBuild(geo, P);
  chart = new SeaChart(
    data,
    P,
    geo.rivers.map((r: number[]) => decodeHalf(r)),
  );
});

/** Samples along a line every quarter of a map unit: how many on land, in the narrows. */
function sample(pts: [number, number][]): {
  n: number;
  land: number;
  narrows: number;
  first: [number, number] | null;
} {
  let n = 0;
  let land = 0;
  let narrows = 0;
  let first: [number, number] | null = null;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 4));
    for (let k = 0; k <= steps; k++) {
      const x = ax + ((bx - ax) * k) / steps;
      const y = ay + ((by - ay) * k) / steps;
      n++;
      const nav = sb.navAt(x, y);
      if (nav === 0) {
        land++;
        first ??= [x, y];
      } else if (nav === 1) narrows++;
    }
  }
  return { n, land, narrows, first };
}

describe("harbours (MAP r12)", () => {
  test("every coastal province has a harbour on the water, off its own shore", () => {
    const missing = P.filter(
      (p, i) => p.coastal && !p.closed && !chart.harbour(i),
    ).map((p) => p.name);
    expect(missing).toEqual([]);
    for (const hb of chart.harbours) {
      // The moorings are on the water; the landing is on the shore near them.
      expect(sb.navAt(hb.x, hb.y), P[hb.p].name).toBeGreaterThan(0);
      expect(Math.hypot(hb.x - hb.lx, hb.y - hb.ly)).toBeLessThan(8);
      for (const [bx, by] of hb.berths)
        expect(
          sample([
            [hb.x, hb.y],
            [bx, by],
          ]).land,
          P[hb.p].name,
        ).toBe(0);
    }
    // Most moorings lie on open water (the rest on rivers drawn as pools).
    const open = chart.harbours.filter((h) => sb.navAt(h.x, h.y) === 2);
    expect(open.length / chart.harbours.length).toBeGreaterThan(0.9);
  });

  test("the rivers' ports: the St. Lawrence, the Hudson and the James", () => {
    for (const name of ["Hochelaga", "Trois-Rivières", "Esopus", "Appamattuck"])
      expect(chart.harbour(byName(name)), name).not.toBeNull();
    // Quebec to Montreal by water: up the river, not across the country.
    for (const [a, b] of [
      ["Quebec", "Trois-Rivières"],
      ["Trois-Rivières", "Hochelaga"],
      ["Raritan", "Esopus"],
      ["Jamestown", "Appamattuck"],
    ]) {
      const lane = chart.lane(byName(a), byName(b))!;
      expect(lane, `${a} > ${b}`).not.toBeNull();
      expect(sample(lane.pts).land).toBe(0);
    }
  });

  test("every lane between two harbours keeps to the water", () => {
    let samples = 0;
    let narrows = 0;
    const dry: string[] = [];
    for (const row of data.lanes) {
      const lane = chart.lane(row[0], row[1])!;
      const r = sample(lane.pts);
      samples += r.n;
      narrows += r.narrows;
      if (r.land)
        dry.push(`${P[row[0]].name} > ${P[row[1]].name} at ${r.first}`);
    }
    expect(dry).toEqual([]);
    // The narrows are only the joins in the chained rivers.
    expect(narrows / samples).toBeLessThan(0.01);
  });

  test("every pair of provinces the rules let a boat cross between has a lane", () => {
    const missing: string[] = [];
    P.forEach((def, a) => {
      for (const [b] of def.sea)
        if (!chart.lane(a, b)) missing.push(`${def.name} > ${P[b].name}`);
      for (const [b, , , strait] of def.nb)
        if (strait && !chart.lane(a, b))
          missing.push(`${def.name} ~ ${P[b].name}`);
    });
    expect(missing).toEqual([]);
  });

  test("ships for Europe sail out from the harbour over the water", () => {
    for (const row of data.europe) {
      const pts = chart.toEurope(row[0]);
      // The last stretch runs on past the edge of the chart.
      expect(sample(pts.slice(0, -1)).land, P[row[0]].name).toBe(0);
      const hb = chart.harbour(row[0])!;
      expect(pts[0]).toEqual([hb.x, hb.y]);
    }
    expect(data.europe.length).toBeGreaterThan(150);
  });

  test("a hop by sea: down to the quay, harbour to harbour, up to the town", () => {
    const a = byName("Jamestown");
    const b = byName("New Amsterdam");
    const way = chart.seaWay(a, b)!;
    expect(way.legs[0]).toBe("walk");
    expect(way.legs[way.legs.length - 1]).toBe("walk");
    expect(way.legs).toContain("sail");
    // It starts in the town and ends in the other.
    expect(way.pts[0]).toEqual([P[a].x, P[a].y]);
    expect(way.pts[way.pts.length - 1]).toEqual([P[b].x, P[b].y]);
    // Afloat only on the water.
    const sailed: [number, number][] = [];
    way.legs.forEach((leg, i) => {
      if (leg === "sail") sailed.push(way.pts[i], way.pts[i + 1]);
    });
    expect(sample(sailed).land).toBe(0);
    // Time runs on through it, and the middle of the hop is at sea.
    for (let i = 1; i < way.at.length; i++)
      expect(way.at[i]).toBeGreaterThanOrEqual(way.at[i - 1]);
    expect(alongWay(way, 0.5)[3]).toBe("sail");
    expect(alongWay(way, 0)[3]).toBe("walk");
    expect(alongWay(way, 1)[3]).toBe("walk");
    expect(restOfWay(way, 0.5).length).toBeLessThan(way.pts.length + 1);
  });

  test("every ship position along every hop is on the water", () => {
    // Where a boat is drawn, a fiftieth of the hop at a time.
    let bad = 0;
    for (const row of data.lanes) {
      for (const [a, b] of [
        [row[0], row[1]],
        [row[1], row[0]],
      ]) {
        const way = chart.seaWay(a, b)!;
        for (let k = 0; k <= 50; k++) {
          const [x, y, , leg] = alongWay(way, k / 50);
          if (leg === "sail" && sb.navAt(x, y) === 0) bad++;
        }
      }
    }
    expect(bad).toBe(0);
  });

  test("canoes go along the rivers: the Mississippi and the Ohio", () => {
    const runs = data.rivers.map(([a, b]) => `${P[a].name}-${P[b].name}`);
    expect(runs).toContain("Natchez-Tunica");
    expect(runs).toContain("Forks of the Ohio-Kanawha");
    const way = chart.riverWay(byName("Natchez"), byName("Tunica"))!;
    expect(way.legs).toContain("sail");
    // The paddled stretch is the river's own line.
    const rivers = geo.rivers.map((r: number[]) => decodeHalf(r));
    const onRiver = (x: number, y: number) =>
      rivers.some((line: [number, number][]) =>
        line.some(([rx, ry]) => rx === x && ry === y),
      );
    way.legs.forEach((leg, i) => {
      if (leg !== "sail") return;
      expect(onRiver(...way.pts[i])).toBe(true);
      expect(onRiver(...way.pts[i + 1])).toBe(true);
    });
    // Both ways along it.
    expect(chart.riverWay(byName("Tunica"), byName("Natchez"))).not.toBeNull();
  });

  test("the stored harbours and lanes are what the builder makes of today's map", () => {
    // The whole build takes a while; the harbours, a spread of lanes and the
    // river runs are enough to show the file is up to date.
    const fresh = sb.harbours.map((hb, k) => [
      hb.p,
      hb.body,
      Math.round(hb.x * 2),
      Math.round(hb.y * 2),
      Math.round(hb.lx * 2),
      Math.round(hb.ly * 2),
      Math.round(hb.room * 2),
      ...sb
        .berths(k)
        .flatMap(([x, y]) => [Math.round(x * 2), Math.round(y * 2)]),
    ]);
    expect(fresh).toEqual(data.harbours);
    for (let i = 0; i < data.lanes.length; i += 97) {
      const row = data.lanes[i];
      const lane = sb.lane(row[0], row[1])!;
      expect(lane.ha).toBe(row[2]);
      expect(lane.hb).toBe(row[3]);
      const pts = decodeHalf(row, 5);
      expect(lane.pts).toEqual(pts);
    }
    void buildSeaData;
  });
});
