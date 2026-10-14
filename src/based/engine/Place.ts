// A 3D place (r21): a set Mr. Based walks around in, as the server sends it
// from src/based/places/<key>.json. The client builds it out of a kit of
// pieces (walls, the bar, windows, lamps, façades...) and the props models;
// the engine only needs its names: marks where people stand, hotspots to
// look at, camera shots, props the story can show or hide, and the floor
// plan for walking.
//
// Distances are in metres; y is up. Angles are in degrees, 0 facing +z.

/** [x0, z0, x1, z1] */
export type Rect = [number, number, number, number];

export interface Mark {
  at: [number, number];
  /** Facing, in degrees. */
  face?: number;
  /** Seat height for sitting poses. */
  seat?: number;
}

export interface Hotspot {
  /** Where it is, or, with `bone`, the offset from that bone. */
  at: [number, number, number];
  /** How big a target it is. */
  r?: number;
  /** Where he stands to look at it (a mark), or where he is if absent. */
  stand?: string;
  /** On someone: their cast id and the bone. */
  on?: { who: string; bone: string };
}

export interface Shot {
  /** What the camera looks at. */
  at: [number, number, number];
  /** Metres of the place across the screen's height. */
  span: number;
}

export interface Area {
  id: string;
  rect: Rect;
  /** Metres across the screen's height while he's in it. */
  span: number;
  /** Walls tagged with this area's id are cut down while he's inside. */
  inside?: boolean;
  /** Rain falls here. */
  rain?: boolean;
}

/** One piece of the set, built by the client's kit. */
export interface Item {
  kind: string;
  /** For @show and @hide, and for hotspots that point at it. */
  id?: string;
  at: [number, number, number];
  rot?: number;
  hidden?: boolean;
  /** The piece's own settings (size, colour, text, model...). */
  [k: string]: unknown;
}

export interface LightDef {
  kind: "point" | "spot" | "dir" | "hemi";
  at?: [number, number, number];
  to?: [number, number, number];
  color: string;
  ground?: string;
  intensity: number;
  distance?: number;
  angle?: number;
  penumbra?: number;
  shadow?: boolean;
  /** Flicker like a bad tube or a TV. */
  flicker?: "tv" | "neon" | "candle";
  /** Only while he's in this area (for interiors). */
  area?: string;
}

export interface PlaceDef {
  key: string;
  name: string;
  camera: { azimuth: number; elevation: number };
  nav: { bounds: Rect; cell: number; blocks: Rect[] };
  areas: Area[];
  marks: Record<string, Mark>;
  hotspots: Record<string, Hotspot>;
  shots: Record<string, Shot>;
  items: Item[];
  lights: LightDef[];
  env: {
    background: string;
    fog: string;
    fogDensity: number;
    exposure?: number;
  };
}

/** The names a script can use in a place. */
export function placeNames(p: PlaceDef): {
  marks: Set<string>;
  hotspots: Set<string>;
  shots: Set<string>;
  props: Set<string>;
} {
  return {
    marks: new Set(Object.keys(p.marks)),
    hotspots: new Set(Object.keys(p.hotspots)),
    shots: new Set(Object.keys(p.shots)),
    props: new Set(p.items.map((i) => i.id).filter((x): x is string => !!x)),
  };
}
