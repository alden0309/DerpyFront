// r25 (BSTORY): the pieces of the Hôtel Vauban's lobby and of his room
// upstairs: the staircase and the rope that closes it, the front desk, the
// guest book, a chandelier, a standard lamp, the lift's dead button, and a
// bed, a holdall, a radiator, a night table and a wardrobe. Like the small
// pieces in Kit.ts, each is a few plain shapes whose colours are painted
// into them, so a place's static merge draws all of them with what's
// already there (a draw or two). Words on them (the rope's card) come from
// the place's data. Local +z is a piece's front; the staircase rises along
// its local +x.

import * as THREE from "three";
import { Item } from "../../engine/Place";
import { Built, emissive, halo, KitContext, mat, part } from "./Kit";
import { textTexture } from "./Textures";

/** The kinds built here. */
export const FURNISHINGS = new Set([
  "stairs",
  "rope",
  "desk",
  "ledger",
  "chandelier",
  "floorlamp",
  "liftbutton",
  "bed",
  "holdall",
  "radiator",
  "nightstand",
  "wardrobe",
]);

function num(v: unknown, d: number): number {
  return typeof v === "number" ? v : d;
}
function str(v: unknown, d: string): string {
  return typeof v === "string" ? v : d;
}

const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const C = (rt: number, rb: number, h: number, n = 10) =>
  new THREE.CylinderGeometry(rt, rb, h, n);

/** A straight run between two points, as a thin cylinder. */
function rod(
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
  m: THREE.Material,
  n = 6,
): THREE.Mesh {
  const len = a.distanceTo(b);
  const geo = C(r, r, len, n);
  geo.rotateZ(Math.PI / 2);
  const mesh = part(geo, m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  const dir = b.clone().sub(a).normalize();
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
  return mesh;
}

/**
 * A straight flight: oak treads with brass rods and a red runner, dark
 * risers, a sloped soffit underneath (there's room under the top), an open
 * side with iron balusters, a handrail and a newel post at the foot, and a
 * landing at the top (`landing` metres). `steps`, `rise`, `going`, `width`;
 * `open` is the open side, "+z" (default) or "-z".
 */
function stairs(item: Item): THREE.Group {
  const g = new THREE.Group();
  const n = num(item.steps, 16);
  const rise = num(item.rise, 0.21);
  const going = num(item.going, 0.3);
  const w = num(item.width, 1.2);
  const landing = num(item.landing, 0);
  const side = item.open === "-z" ? -1 : 1;
  const tread = mat("oak");
  const dark = mat("oak_dark");
  const runner = mat(str(item.runner, "#5a171a"));
  const brass = mat("brass");
  const iron = mat("iron");
  for (let i = 0; i < n; i++) {
    const top = (i + 1) * rise;
    const x0 = i * going;
    g.add(
      part(
        B(going + 0.03, 0.04, w),
        tread,
        x0 + going / 2 - 0.015,
        top - 0.02,
        0,
      ),
    );
    g.add(
      part(
        B(0.025, rise - 0.04, w - 0.02),
        dark,
        x0 + 0.012,
        top - rise / 2 - 0.02,
        0,
      ),
    );
    g.add(
      part(B(going, 0.006, w * 0.58), runner, x0 + going / 2, top + 0.003, 0),
    );
    g.add(
      part(
        B(0.006, rise - 0.03, w * 0.58),
        runner,
        x0 + 0.028,
        top - rise / 2,
        0,
      ),
    );
    const r = part(
      C(0.008, 0.008, w * 0.64, 6),
      brass,
      x0 + 0.035,
      top - rise + 0.03,
      0,
      false,
    );
    r.rotation.x = Math.PI / 2;
    g.add(r);
  }
  // The soffit and the strings follow the slope.
  const run = n * going;
  const height = n * rise;
  const slope = Math.atan2(height, run);
  const len = Math.hypot(run, height);
  const along = (
    geo: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    m: THREE.Material,
  ) => {
    const mesh = part(geo, m, x, y, z);
    mesh.rotation.z = slope;
    return mesh;
  };
  g.add(along(B(len, 0.06, w - 0.04), run / 2, height / 2 - 0.26, 0, dark));
  for (const s of [1, -1]) {
    g.add(
      along(
        B(len + 0.1, 0.32, 0.05),
        run / 2,
        height / 2 - 0.08,
        (s * w) / 2,
        dark,
      ),
    );
  }
  if (landing > 0) {
    g.add(
      part(B(landing, 0.06, w), tread, run + landing / 2, height - 0.03, 0),
    );
    g.add(part(B(landing, 0.25, w), dark, run + landing / 2, height - 0.19, 0));
  }
  // The open side: balusters every other step, a rail, the newel post.
  const z = (side * w) / 2;
  for (let i = 0; i < n; i += 2) {
    const x = i * going + going / 2;
    const y = (i + 1) * rise;
    g.add(part(C(0.012, 0.012, 0.86, 6), iron, x, y + 0.43, z, false));
  }
  const a = new THREE.Vector3(0.06, 1.0, z);
  const b = new THREE.Vector3(run, height + 0.9, z);
  g.add(rod(a, b, 0.03, mat("oak"), 8));
  g.add(part(B(0.14, 1.06, 0.14), dark, 0.06, 0.53, z));
  g.add(part(new THREE.SphereGeometry(0.055, 10, 6), brass, 0.06, 1.12, z));
  if (landing > 0) {
    g.add(
      rod(
        b,
        new THREE.Vector3(run + landing, height + 0.9, z),
        0.03,
        mat("oak"),
        8,
      ),
    );
  }
  return g;
}

/**
 * A rope barrier: two brass posts (`part` "posts"), the red rope between
 * them with a card hung from it (`part` "hooked", with `text` and `sub`),
 * or the rope unhooked and hanging from one post (`part` "down"). `len` is
 * between the posts, along local x.
 */
function rope(item: Item): THREE.Group {
  const g = new THREE.Group();
  const len = num(item.len, 1.1);
  const which = str(item.part, "posts");
  const brass = mat("brass");
  const red = mat("#6e1519");
  const h = 0.95;
  if (which === "posts") {
    for (const x of [-len / 2, len / 2]) {
      g.add(part(C(0.12, 0.14, 0.04, 14), brass, x, 0.02, 0));
      g.add(part(C(0.022, 0.022, h, 8), brass, x, h / 2, 0));
      g.add(
        part(new THREE.SphereGeometry(0.045, 10, 6), brass, x, h + 0.03, 0),
      );
    }
    return g;
  }
  const curve =
    which === "down"
      ? new THREE.CatmullRomCurve3([
          new THREE.Vector3(-len / 2 + 0.03, h - 0.06, 0),
          new THREE.Vector3(-len / 2 + 0.06, 0.45, 0.02),
          new THREE.Vector3(-len / 2 + 0.12, 0.03, 0.06),
          new THREE.Vector3(-len / 2 + 0.45, 0.02, 0.1),
        ])
      : new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(-len / 2 + 0.03, h - 0.06, 0),
          new THREE.Vector3(0, h - 0.5, 0),
          new THREE.Vector3(len / 2 - 0.03, h - 0.06, 0),
        );
  g.add(part(new THREE.TubeGeometry(curve, 18, 0.022, 6), red, 0, 0, 0));
  if (which === "hooked") {
    const [w, ch] = [0.26, 0.17];
    const tex = textTexture({
      text: str(item.text, ""),
      sub: typeof item.sub === "string" ? item.sub : undefined,
      w,
      h: ch,
      bg: "#e9e2cf",
      fg: "#2a1a12",
      font: "Georgia, serif",
      italic: true,
    });
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(w, ch),
      new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.8,
        side: THREE.DoubleSide,
      }),
    );
    card.position.set(0, h - 0.36 - ch / 2, 0.012);
    g.add(card);
    g.add(part(B(0.004, 0.06, 0.004), brass, 0, h - 0.33, 0.008, false));
  }
  return g;
}

/**
 * A hotel's front desk: panelled oak, a polished top, a brass edge along
 * the guests' side. `size` [w, h, d], the front at local +z.
 */
function desk(item: Item): THREE.Group {
  const [w, h, d] = (item.size as [number, number, number]) ?? [2.2, 1.08, 0.7];
  const g = new THREE.Group();
  g.add(part(B(w, h - 0.05, d), mat("oak_dark"), 0, (h - 0.05) / 2, 0));
  g.add(part(B(w + 0.06, 0.05, d + 0.08), mat("oak"), 0, h - 0.025, 0.02));
  g.add(
    part(
      B(w + 0.06, 0.02, 0.02),
      mat("brass"),
      0,
      h - 0.06,
      d / 2 + 0.055,
      false,
    ),
  );
  g.add(part(B(w, 0.08, 0.04), mat("black"), 0, 0.04, d / 2 + 0.005));
  const panels = Math.max(2, Math.round(w / 0.7));
  const pw = w / panels;
  for (let i = 0; i < panels; i++) {
    g.add(
      part(
        B(pw - 0.14, h - 0.32, 0.02),
        mat("oak"),
        -w / 2 + pw * (i + 0.5),
        (h - 0.05) / 2,
        d / 2 + 0.01,
        false,
      ),
    );
  }
  return g;
}

/**
 * The guest book, open on the desk and turned to the clerk (its writing
 * faces local -z): a dark cover, two pages ruled with the night's names in
 * a hand nobody can read from the guests' side, a ribbon, a pen on a chain.
 */
function ledger(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(B(0.44, 0.018, 0.31), mat("#3a1412"), 0, 0.009, 0, false));
  const page = mat("#d8cfb6");
  const ink = mat("#3a3226");
  for (const s of [-1, 1]) {
    const p = part(B(0.2, 0.014, 0.28), page, s * 0.104, 0.024, 0, false);
    p.rotation.z = -s * 0.05;
    g.add(p);
    for (let i = 0; i < 7; i++) {
      g.add(
        part(
          B(0.15 - (i % 3) * 0.02, 0.002, 0.004),
          ink,
          s * 0.104 + 0.005 * s,
          0.033,
          -0.1 + i * 0.032,
          false,
        ),
      );
    }
  }
  g.add(part(B(0.008, 0.003, 0.2), mat("#7a1a1c"), 0, 0.034, 0.1, false));
  const pen = part(
    C(0.006, 0.006, 0.13, 6),
    mat("black"),
    0.3,
    0.008,
    -0.06,
    false,
  );
  pen.rotation.x = Math.PI / 2;
  pen.rotation.z = 0.4;
  g.add(pen);
  g.add(
    rod(
      new THREE.Vector3(0.3, 0.008, -0.12),
      new THREE.Vector3(0.36, 0.005, -0.22),
      0.002,
      mat("brass"),
      4,
    ),
  );
  return g;
}

/** A brass chandelier: a ring of candle bulbs on a stem. Lit by the place. */
function chandelier(item: Item): THREE.Group {
  const g = new THREE.Group();
  const r = num(item.r, 0.38);
  const brass = mat("brass");
  const ring = part(
    new THREE.TorusGeometry(r, 0.014, 6, 24),
    brass,
    0,
    0,
    0,
    false,
  );
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  g.add(
    part(
      C(0.01, 0.01, num(item.drop, 0.7), 6),
      brass,
      0,
      num(item.drop, 0.7) / 2,
      0,
      false,
    ),
  );
  g.add(part(new THREE.SphereGeometry(0.06, 10, 6), brass, 0, -0.02, 0, false));
  const bulb = emissive("#ffd7a0", 2.2);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    g.add(part(C(0.022, 0.016, 0.05, 8), brass, x, 0.03, z, false));
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), bulb);
    b.scale.y = 1.5;
    b.position.set(x, 0.09, z);
    g.add(b);
  }
  const hl = halo("#ffc47e", r * 3.4, 0.45);
  hl.position.y = 0.06;
  g.add(hl);
  return g;
}

/** A standard lamp: a weighted foot, a brass pole, a lit fabric shade. */
function floorlamp(item: Item, k: KitContext): Built {
  const g = new THREE.Group();
  const h = num(item.h, 1.55);
  g.add(part(C(0.15, 0.17, 0.03, 16), mat("brass"), 0, 0.015, 0));
  g.add(part(C(0.014, 0.014, h, 6), mat("brass"), 0, h / 2, 0, false));
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.22, 0.28, 16, 1, true),
    emissive(str(item.shade, "#d7a866"), 0.62),
  );
  (shade.material as THREE.Material).side = THREE.DoubleSide;
  shade.position.y = h + 0.02;
  g.add(shade);
  const hl = halo("#ffc27e", 1.1, 0.45);
  hl.position.y = h;
  g.add(hl);
  const lights: Built["lights"] = [];
  const l = item.light as
    | { color?: string; intensity?: number; distance?: number }
    | undefined;
  if (l) {
    const pl = new THREE.PointLight(
      l.color ?? "#ffb46c",
      l.intensity ?? 1.6,
      l.distance ?? 4,
      2,
    );
    pl.position.y = h - 0.05;
    g.add(pl);
    lights.push({
      light: pl,
      base: l.intensity ?? 1.6,
      minor: item.minor === true,
      prio: item.minor === true ? 0 : num(item.prio, 1),
    });
  }
  // A lamp in a lit room is its glow; a light only if the place asks.
  void k;
  return { object: g, lights, lamps: [] };
}

/** The lift's call button on its brass plate: up, down, and nothing. */
function liftbutton(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(B(0.1, 0.22, 0.012), mat("brass"), 0, 0, 0, false));
  for (const y of [0.05, -0.05]) {
    const b = part(
      C(0.018, 0.018, 0.012, 10),
      mat("#1a1816"),
      0,
      y,
      0.01,
      false,
    );
    b.rotation.x = Math.PI / 2;
    g.add(b);
  }
  return g;
}

/**
 * A hotel double bed against a wall: the headboard at local -z, a white
 * sheet turned down over a dark red blanket, two pillows. `size` [w, l].
 */
function bed(item: Item): THREE.Group {
  const [w, l] = (item.size as [number, number]) ?? [1.5, 2.0];
  const g = new THREE.Group();
  const wood = mat("oak_dark");
  const white = mat("#d6d0c2");
  g.add(part(B(w + 0.08, 0.3, l + 0.04), wood, 0, 0.15, 0));
  g.add(part(B(w, 0.2, l - 0.04), white, 0, 0.4, 0));
  const blanket = mat(str(item.blanket, "#4c1a1d"));
  g.add(part(B(w + 0.05, 0.07, l * 0.64), blanket, 0, 0.535, l * 0.17));
  g.add(
    part(B(w + 0.05, 0.075, 0.14), white, 0, 0.54, l * 0.17 - l * 0.32 + 0.07),
  );
  for (const s of [-1, 1]) {
    const p = part(
      B(w / 2 - 0.1, 0.13, 0.36),
      white,
      (s * w) / 4,
      0.565,
      -l / 2 + 0.25,
    );
    p.rotation.y = s * 0.04;
    p.rotation.x = -0.12;
    g.add(p);
  }
  g.add(part(B(w + 0.14, 1.1, 0.06), wood, 0, 0.55, -l / 2 - 0.03));
  g.add(
    part(B(w - 0.2, 0.5, 0.02), mat("oak"), 0, 0.78, -l / 2 + 0.005, false),
  );
  g.add(part(B(w + 0.1, 0.55, 0.05), wood, 0, 0.275, l / 2 + 0.02));
  return g;
}

/** His holdall: black canvas, two handles, a strap. */
function holdall(item: Item): THREE.Group {
  const g = new THREE.Group();
  const cloth = mat(str(item.color, "#1d1f1c"));
  const body = part(C(0.15, 0.15, 0.56, 12), cloth, 0, 0.15, 0);
  body.rotation.z = Math.PI / 2;
  body.scale.set(1, 1, 0.82);
  g.add(body);
  for (const x of [-0.1, 0.1]) {
    const hnd = part(
      new THREE.TorusGeometry(0.07, 0.01, 4, 10, Math.PI),
      mat("#111"),
      x,
      0.29,
      0,
      false,
    );
    g.add(hnd);
  }
  g.add(part(B(0.5, 0.02, 0.012), mat("#3d3a30"), 0, 0.26, 0.11, false));
  return g;
}

/** A cast-iron radiator under a window. `w` wide. */
function radiator(item: Item): THREE.Group {
  const g = new THREE.Group();
  const w = num(item.w, 1.0);
  const n = Math.max(4, Math.round(w / 0.07));
  const iron = mat("#3a3c3a");
  for (let i = 0; i < n; i++) {
    g.add(
      part(B(0.045, 0.6, 0.12), iron, -w / 2 + (i + 0.5) * (w / n), 0.38, 0),
    );
  }
  g.add(part(B(w, 0.04, 0.08), iron, 0, 0.08, 0));
  return g;
}

/** A night table with a drawer. */
function nightstand(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(B(0.46, 0.56, 0.4), mat("oak_dark"), 0, 0.28, 0));
  g.add(part(B(0.4, 0.14, 0.02), mat("oak"), 0, 0.44, 0.205, false));
  g.add(part(B(0.06, 0.02, 0.02), mat("brass"), 0, 0.44, 0.22, false));
  return g;
}

/** A wardrobe: two tall doors, a cornice. `size` [w, h, d]. */
function wardrobe(item: Item): THREE.Group {
  const [w, h, d] = (item.size as [number, number, number]) ?? [1.1, 2.1, 0.58];
  const g = new THREE.Group();
  g.add(part(B(w, h, d), mat("oak_dark"), 0, h / 2, 0));
  g.add(part(B(w + 0.06, 0.08, d + 0.05), mat("oak_dark"), 0, h + 0.04, 0.01));
  for (const s of [-1, 1]) {
    g.add(
      part(
        B(w / 2 - 0.08, h - 0.3, 0.02),
        mat("oak"),
        (s * w) / 4,
        h / 2,
        d / 2 + 0.01,
        false,
      ),
    );
    g.add(
      part(
        B(0.02, 0.1, 0.02),
        mat("brass"),
        s * 0.05,
        h * 0.52,
        d / 2 + 0.03,
        false,
      ),
    );
  }
  return g;
}

/** Builds one of the pieces above. */
export function furnish(item: Item, k: KitContext): Built {
  switch (item.kind) {
    case "floorlamp":
      return floorlamp(item, k);
    case "stairs":
      return { object: stairs(item), lights: [], lamps: [] };
    case "rope":
      return { object: rope(item), lights: [], lamps: [] };
    case "desk":
      return { object: desk(item), lights: [], lamps: [] };
    case "ledger":
      return { object: ledger(), lights: [], lamps: [] };
    case "chandelier":
      return { object: chandelier(item), lights: [], lamps: [] };
    case "liftbutton":
      return { object: liftbutton(), lights: [], lamps: [] };
    case "bed":
      return { object: bed(item), lights: [], lamps: [] };
    case "holdall":
      return { object: holdall(item), lights: [], lamps: [] };
    case "radiator":
      return { object: radiator(item), lights: [], lamps: [] };
    case "nightstand":
      return { object: nightstand(), lights: [], lamps: [] };
    default:
      return { object: wardrobe(item), lights: [], lamps: [] };
  }
}
