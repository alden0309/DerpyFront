// The r22 hotfix: quantized furniture keeps its place when the world bakes
// pieces together (before, every vertex clamped to ±1 m and the stools
// piled up in the middle of the bar).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { describe, expect, test } from "vitest";
import { worldGeometry } from "../../src/based/client/world/Merge";

/** A unit quad stored as glTF quantization does: normalized int16, scaled by its node. */
function quantizedQuad(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const q = 32767;
  g.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Int16Array([-q, 0, -q, q, 0, -q, q, 0, q, -q, 0, q]),
      3,
      true,
    ),
  );
  g.setAttribute(
    "normal",
    new THREE.BufferAttribute(
      new Int8Array([0, 127, 0, 0, 127, 0, 0, 127, 0, 0, 127, 0]),
      3,
      true,
    ),
  );
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

function placed(x: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(quantizedQuad());
  m.scale.setScalar(0.25); // the node's dequantization scale
  m.position.set(x, 0.5, z);
  m.updateMatrixWorld(true);
  return m;
}

describe("baking quantized pieces (r22 hotfix)", () => {
  test("a piece far from the origin stays where it stands", () => {
    const m = placed(5.3, -2.1);
    const g = worldGeometry(m.geometry, m.matrixWorld);
    g.computeBoundingBox();
    const b = g.boundingBox!;
    expect(b.min.x).toBeCloseTo(5.05, 2);
    expect(b.max.x).toBeCloseTo(5.55, 2);
    expect(b.min.z).toBeCloseTo(-2.35, 2);
    expect(b.max.y).toBeCloseTo(0.5, 2);
    expect(g.getAttribute("position").array).toBeInstanceOf(Float32Array);
    expect(g.getAttribute("normal").getY(0)).toBeCloseTo(1, 2);
  });

  test("the old way clamped it to ±1 m (what went wrong)", () => {
    const m = placed(5.3, -2.1);
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.x).toBeLessThanOrEqual(1.0001);
  });

  test("pieces of one material bake together, each in its own place", () => {
    const geos = [placed(-3, 1), placed(4, -2)].map((m) =>
      worldGeometry(m.geometry, m.matrixWorld),
    );
    const merged = mergeGeometries(geos, false)!;
    expect(merged).toBeTruthy();
    merged.computeBoundingBox();
    expect(merged.boundingBox!.min.x).toBeCloseTo(-3.25, 2);
    expect(merged.boundingBox!.max.x).toBeCloseTo(4.25, 2);
  });
});
