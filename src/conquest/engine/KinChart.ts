// TREE (r25): a genealogist's chart, as geometry. People sit in slots (one
// card wide) and rows (one generation); husbands and wives are joined by a
// double rule (or, with others between them, by a line run beneath), and
// children hang from a rail under the couple they came of. HOME's family
// tree (Kin.ts) and the dynasty (DynastyCore.ts) are both charts; the game
// and the site draw them, each in its own look, from the lines made here.
//
// Pure geometry: no state, no DOM.

export interface ChartNode {
  /** The person (a character in the family tree, an index in a dynasty). */
  c: number;
  /** The generation: rows go down as it grows. */
  gen: number;
  /** Slot (centre of the card), in card widths. */
  x: number;
}

export interface ChartCouple {
  a: number;
  b: number;
  /** Married (living or widowed), or lovers. */
  kind: "married" | "lovers";
  /** Next to each other, or with others between. */
  near: boolean;
  /** Order among couples with others between (to stack their lines). */
  lane: number;
}

export interface ChartDescent {
  /** Parents on the chart (one or two). */
  parents: number[];
  children: number[];
  /** A child not owned to (a lover's child kept secret). */
  hidden?: boolean;
}

export interface Chart {
  nodes: ChartNode[];
  couples: ChartCouple[];
  descents: ChartDescent[];
  /** Leftmost and rightmost slots, and the generations shown. */
  minX: number;
  maxX: number;
  minGen: number;
  maxGen: number;
}

/** The chart's measures, in pixels. */
export interface ChartDims {
  /** A slot (a card and its margin), a generation's row, the card itself. */
  UW: number;
  RH: number;
  CW: number;
  CH: number;
  /** Where the double rule between a couple runs: the portrait's middle. */
  BAR: number;
  PADX: number;
  PADY: number;
}

/** The game's family tree's measures (HOME r12). */
export const KIN_DIMS: ChartDims = {
  UW: 132,
  RH: 196,
  CW: 116,
  CH: 150,
  BAR: 44,
  PADX: 64,
  PADY: 112,
};

/** One stroke: a wedding's rule ("wed") or a line of descent ("line"). */
export interface ChartLine {
  kind: "wed" | "line";
  /** "married"/"lovers" and "far" for a wedding, "hidden" for a line. */
  mods: string[];
  d: string;
  /** A dash pattern ("" for a solid stroke). */
  dash: string;
}

export function chartSize(t: Chart, d: ChartDims): { w: number; h: number } {
  return {
    w: (t.maxX + 1) * d.UW + d.PADX * 2,
    h: (t.maxGen - t.minGen) * d.RH + d.CH + d.PADY + 40,
  };
}

export const chartLeft = (d: ChartDims, x: number): number => d.PADX + x * d.UW;
export const chartTop = (t: Chart, d: ChartDims, gen: number): number =>
  d.PADY + (gen - t.minGen) * d.RH;

/** Every stroke of the chart: the weddings, then the families hung from them. */
export function chartLines(t: Chart, d: ChartDims): ChartLine[] {
  const { CW, CH, BAR, RH } = d;
  const byId = new Map(t.nodes.map((n) => [n.c, n]));
  const cx = (id: number) => chartLeft(d, byId.get(id)!.x) + CW / 2;
  const tp = (id: number) => chartTop(t, d, byId.get(id)!.gen);
  const out: ChartLine[] = [];
  const same = (c: ChartCouple, a: number, b: number) =>
    (c.a === a && c.b === b) || (c.a === b && c.b === a);
  const nearCouple = (a: number, b: number) =>
    t.couples.find((c) => c.near && same(c, a, b));
  const farCouple = (a: number, b: number) =>
    t.couples.find((c) => !c.near && same(c, a, b));
  for (const c of t.couples) {
    if (!byId.has(c.a) || !byId.has(c.b)) continue;
    const x1 = Math.min(cx(c.a), cx(c.b));
    const x2 = Math.max(cx(c.a), cx(c.b));
    const y = tp(c.a);
    const dash = c.kind === "lovers" ? "5 4" : "";
    if (c.near)
      out.push({
        kind: "wed",
        mods: [c.kind],
        d: `M${x1 + CW / 2 - 2} ${y + BAR - 2.5} H${x2 - CW / 2 + 2} M${x1 + CW / 2 - 2} ${y + BAR + 2.5} H${x2 - CW / 2 + 2}`,
        dash,
      });
    else {
      const ly = y + CH + 10 + c.lane * 7;
      out.push({
        kind: "wed",
        mods: ["far", c.kind],
        d: `M${x1} ${y + CH} V${ly} H${x2} V${y + CH}`,
        dash,
      });
    }
  }
  // Several families hung from one row: each its own rail, a little lower.
  const rails = new Map<number, number>();
  for (const ds of t.descents) {
    const kids = ds.children.filter((id) => byId.has(id));
    if (!kids.length || !ds.parents.every((p) => byId.has(p))) continue;
    const pTop = tp(ds.parents[0]);
    const rail = rails.get(pTop) ?? 0;
    rails.set(pTop, rail + 1);
    const busY = pTop + CH + (RH - CH) / 2 + 2 + (rail % 3) * 6;
    let dropX: number;
    let dropY: number;
    if (ds.parents.length === 2) {
      const [a, b] = ds.parents;
      dropX = (cx(a) + cx(b)) / 2;
      const far = farCouple(a, b);
      dropY = far ? pTop + CH + 10 + far.lane * 7 : pTop + BAR + 2.5;
      if (!far && !nearCouple(a, b)) dropY = pTop + CH;
    } else {
      dropX = cx(ds.parents[0]);
      dropY = pTop + CH;
    }
    const xs = kids.map((id) => cx(id));
    const lo = Math.min(dropX, ...xs);
    const hi = Math.max(dropX, ...xs);
    const kidTop = tp(kids[0]);
    out.push({
      kind: "line",
      mods: ds.hidden ? ["hidden"] : [],
      d: `M${dropX} ${dropY} V${busY} M${lo} ${busY} H${hi} ${xs
        .map((x) => `M${x} ${busY} V${kidTop - 3}`)
        .join(" ")}`,
      dash: "",
    });
  }
  return out;
}
