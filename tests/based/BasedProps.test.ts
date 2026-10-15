// BFIX (r23): the props modelled for Mr. Based in Fusion. Every one the
// places use is there, credited, small and compressed, within its triangle
// budget; their materials are the palette's (shared, so the static merge
// bakes them; recolourable, so the parked cars differ; lit where they're
// lights); the engine's table of their footprints matches the models; and
// the van carries its own light bar.

import fs from "fs";
import path from "path";
import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, test } from "vitest";
import { buildItem, KitContext } from "../../src/based/client/world/Kit";
import {
  PALETTE,
  paletteMaterial,
  paletteName,
} from "../../src/based/client/world/Palette";
import { PlaceDef } from "../../src/based/engine/Place";
import { PROP_SHAPES } from "../../src/based/engine/Props";
import { polyDist } from "../../src/based/engine/Solid";

const ROOT = path.resolve(__dirname, "../..");
const MODELS = path.join(ROOT, "src/based/models");

/** The Fusion props, by the names the places use, with their budgets. */
const FUSION: Record<string, number> = {
  stoolBar: 2000,
  chair: 2000,
  tableRound: 2000,
  loungeChair: 4000,
  coatRackStanding: 2000,
  bench: 3000,
  trashcan: 2500,
  sedan: 5000,
  van: 6000,
  lamppost: 2500,
  morrisColumn: 4000,
};

async function load(key: string): Promise<GLTF> {
  const buf = fs.readFileSync(path.join(MODELS, `${key}.glb`));
  const ab = new ArrayBuffer(buf.length);
  new Uint8Array(ab).set(buf);
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(ab, "");
}

function triangles(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (m.isMesh) {
      n +=
        (m.geometry.index?.count ?? m.geometry.getAttribute("position").count) /
        3;
    }
  });
  return n;
}

const PLACES: Record<string, PlaceDef> = Object.fromEntries(
  ["street", "vauban", "elysee"].map((k) => [
    k,
    JSON.parse(
      fs.readFileSync(path.join(ROOT, `src/based/places/${k}.json`), "utf8"),
    ) as PlaceDef,
  ]),
);

let fusion: GLTF;
let kenney: GLTF;
beforeAll(async () => {
  fusion = await load("fusion_props");
  kenney = await load("props");
});

describe("the props modelled in Fusion (r23)", () => {
  test("every one is there, under its budget, small and credited", () => {
    const names = fusion.scene.children.map((c) => c.name).sort();
    expect(names).toEqual(Object.keys(FUSION).sort());
    for (const c of fusion.scene.children) {
      const n = triangles(c);
      expect(n, c.name).toBeGreaterThan(500);
      expect(n, c.name).toBeLessThanOrEqual(FUSION[c.name]);
    }
    const file = fs.readFileSync(path.join(MODELS, "fusion_props.glb"));
    expect(file.length).toBeLessThan(400_000);
    const json = file.subarray(20, 20 + file.readUInt32LE(12)).toString();
    expect(json).toContain("EXT_meshopt_compression");
    expect(json).toContain("KHR_mesh_quantization");
    const credits = JSON.parse(
      fs.readFileSync(path.join(ROOT, "src/based/art/credits.json"), "utf8"),
    ) as { items: { keys: string[]; license: string; changes: string }[] };
    const c = credits.items.find((i) => i.keys.includes("fusion_props"))!;
    expect(c.license).toBe("Original work");
    expect(c.changes).toContain("Modelled for Mr. Based in Autodesk Fusion");
  });

  test("they're made to size, standing on the floor", () => {
    const want: Record<string, [number, number, number]> = {
      stoolBar: [0.39, 0.77, 0.39],
      chair: [0.44, 0.87, 0.51],
      tableRound: [0.62, 0.74, 0.62],
      sedan: [1.94, 1.41, 4.32],
      van: [2.12, 2.11, 4.83],
      lamppost: [0.52, 4.41, 0.52],
      morrisColumn: [1.41, 3.74, 1.41],
    };
    for (const c of fusion.scene.children) {
      const b = new THREE.Box3().setFromObject(c);
      expect(Math.abs(b.min.y), c.name).toBeLessThan(0.04);
      const w = want[c.name];
      if (!w) continue;
      const s = b.getSize(new THREE.Vector3());
      expect(s.x, c.name).toBeCloseTo(w[0], 1);
      expect(s.y, c.name).toBeCloseTo(w[1], 1);
      expect(s.z, c.name).toBeCloseTo(w[2], 1);
    }
  });

  test("the Kenney models left are only the ones still used", () => {
    const used = new Set<string>();
    for (const p of Object.values(PLACES)) {
      for (const it of p.items) {
        if (it.kind === "model") used.add(it.model as string);
      }
    }
    const fusionNames = new Set(fusion.scene.children.map((c) => c.name));
    for (const c of kenney.scene.children) {
      expect(used.has(c.name), `${c.name} is unused`).toBe(true);
      expect(fusionNames.has(c.name), `${c.name} is in both`).toBe(false);
    }
    // And every model a place names is in one or the other.
    for (const m of used) {
      expect(
        fusionNames.has(m) || kenney.scene.children.some((c) => c.name === m),
        m,
      ).toBe(true);
    }
    // The Fusion ones are drawn at their own size (no stretching height).
    for (const p of Object.values(PLACES)) {
      for (const it of p.items) {
        if (it.kind === "model" && fusionNames.has(it.model as string)) {
          expect(it.height, `${p.key} ${it.model}`).toBeUndefined();
        }
      }
    }
  });

  test("the engine's footprints match the models", () => {
    for (const g of [fusion, kenney]) {
      for (const c of g.scene.children) {
        const shape = PROP_SHAPES[c.name];
        expect(shape, c.name).toBeTruthy();
        c.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(c);
        const s = b.getSize(new THREE.Vector3());
        expect(shape.size[0]).toBeCloseTo(s.x, 2);
        expect(shape.size[1]).toBeCloseTo(s.y, 2);
        expect(shape.size[2]).toBeCloseTo(s.z, 2);
        if (s.y < 0.12) continue; // flat: walked over
        // Everything from the floor to head height is inside the footprint.
        const cx = (b.min.x + b.max.x) / 2;
        const cz = (b.min.z + b.max.z) / 2;
        const v = new THREE.Vector3();
        let worst = 0;
        c.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const p = m.geometry.getAttribute("position");
          for (let i = 0; i < p.count; i += 3) {
            v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
            const up = v.y - b.min.y;
            if (up > 1.95 || up < 0.02) continue;
            worst = Math.max(worst, polyDist([v.x - cx, v.z - cz], shape.hull));
          }
        });
        expect(worst, c.name).toBeLessThan(0.02);
      }
    }
  });
});

describe("the palette", () => {
  test("every material of the props is the palette's, one each", () => {
    const names = new Set<string>();
    fusion.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) names.add((m.material as THREE.Material).name);
    });
    for (const n of names) expect(paletteName(n), n).toBe(n);
    expect(paletteName("leather (3)")).toBe("leather");
    expect(paletteName("chrome")).toBeNull();
  });

  test("brass is metal, glass dark and glossy, the lights glow", () => {
    expect(PALETTE.brass.metalness).toBe(1);
    expect(PALETTE.hub.metalness).toBeGreaterThan(0.8);
    expect(PALETTE.glass.roughness).toBeLessThan(0.1);
    expect(
      new THREE.Color(PALETTE.glass.color).getHSL({ h: 0, s: 0, l: 0 }).l,
    ).toBeLessThan(0.1);
    for (const n of ["glass_lamp", "lamp_bulb", "light_white", "light_red"]) {
      expect(PALETTE[n].emissive, n).toBeTruthy();
      expect(paletteMaterial(n).emissiveIntensity, n).toBeGreaterThan(0);
    }
    // Nothing (but the lamps) brighter than the noir allows.
    for (const [n, f] of Object.entries(PALETTE)) {
      if (n === "glass_lamp" || n === "lamp_bulb" || n === "light_white") {
        continue;
      }
      const l = new THREE.Color(f.color).getHSL({ h: 0, s: 0, l: 0 }).l;
      expect(l, n).toBeLessThan(0.86);
    }
  });

  test("shared: the same material for every prop and place; recolours keep the finish", () => {
    expect(paletteMaterial("leather")).toBe(paletteMaterial("leather"));
    const red = paletteMaterial("paint", "#4a2e2c");
    expect(red).toBe(paletteMaterial("paint", "#4a2e2c"));
    expect(red).not.toBe(paletteMaterial("paint"));
    expect(red.roughness).toBe(PALETTE.paint.roughness);
    expect(red.metalness).toBe(PALETTE.paint.metalness);
    expect(red.userData.shared).toBe(true);
  });

  test("the kit dresses a prop from the palette, and two cars can differ", () => {
    const models = new Map<string, THREE.Object3D>();
    for (const c of fusion.scene.children) models.set(c.name, c);
    const k: KitContext = {
      surfaces: null as never,
      models,
      shadows: true,
      lightBudget: "full",
      news: () => null,
    };
    const mats = (o: THREE.Object3D) => {
      const out = new Map<string, THREE.Material>();
      o.traverse((x) => {
        const m = x as THREE.Mesh;
        if (m.isMesh) {
          const mt = m.material as THREE.Material;
          out.set(mt.name, mt);
        }
      });
      return out;
    };
    const stoolA = mats(
      buildItem({ kind: "model", model: "stoolBar", at: [0, 0, 0] }, k).object,
    );
    const stoolB = mats(
      buildItem({ kind: "model", model: "stoolBar", at: [1, 0, 0] }, k).object,
    );
    for (const n of ["leather", "wood", "iron", "brass"]) {
      expect(stoolA.get(n), n).toBe(paletteMaterial(n));
      expect(stoolB.get(n), n).toBe(stoolA.get(n));
    }
    const street = PLACES.street.items.filter((i) => i.model === "sedan");
    expect(street.length).toBe(2);
    const [a, b] = street.map((i) => mats(buildItem(i, k).object));
    expect(a.get("paint")).not.toBe(b.get("paint"));
    expect(a.get("glass")).toBe(b.get("glass"));
    // The van: its own light bar, no box added on top.
    const vanItem = PLACES.street.items.find((i) => i.model === "van")!;
    expect(vanItem.lightbar).toBeUndefined();
    const van = buildItem(vanItem, k).object;
    expect(mats(van).has("lightbar")).toBe(true);
    let boxes = 0;
    van.traverse((x) => {
      if ((x as THREE.Mesh).geometry?.type === "BoxGeometry") boxes++;
    });
    expect(boxes).toBe(0);
    // Standing on the road, the right way round: along the street.
    van.updateMatrixWorld(true);
    const vb = new THREE.Box3().setFromObject(van);
    expect(vb.min.y).toBeGreaterThanOrEqual(-0.01);
    expect(vb.max.x - vb.min.x).toBeGreaterThan(4.5);
    expect(vb.max.z - vb.min.z).toBeLessThan(2.3);
    // Inside the road's kerbs (5.6 to 12.4).
    expect(vb.min.z).toBeGreaterThan(5.6);
    expect(vb.max.z).toBeLessThan(12.4);
  });

  test("the cars park along the kerbs, facing the way the street runs", () => {
    for (const it of PLACES.street.items) {
      if (it.model !== "van" && it.model !== "sedan") continue;
      expect(it.rot, String(it.model)).toBe(90);
      const half = PROP_SHAPES[it.model as string].size[0] / 2;
      const nearKerb = Math.min(
        Math.abs(it.at[2] - half - 5.6),
        Math.abs(it.at[2] + half - 12.4),
      );
      expect(nearKerb, String(it.model)).toBeLessThan(0.3);
    }
  });
});
