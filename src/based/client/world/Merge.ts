// A piece's geometry where it stands in the world, ready to be baked with
// others (r22 hotfix). The furniture and vans come quantized (KHR mesh
// quantization: positions as normalized 16-bit integers, scaled by the
// node), so moving their vertices into world metres straight into that
// storage clamps every one to ±1 m: the stools vanished from their places
// and piled up in the middle of the bar. So every attribute is copied to
// plain floats first, then moved.

import * as THREE from "three";

/** A float copy of `g` (whatever its storage), moved by `matrix`. */
export function worldGeometry(
  g: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    const attr = a as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    const n = attr.count;
    const size = attr.itemSize;
    const arr = new Float32Array(n * size);
    for (let i = 0; i < n; i++) {
      // getX..getW read through any normalization or interleaving.
      arr[i * size] = attr.getX(i);
      if (size > 1) arr[i * size + 1] = attr.getY(i);
      if (size > 2) arr[i * size + 2] = attr.getZ(i);
      if (size > 3) arr[i * size + 3] = attr.getW(i);
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  if (g.index)
    out.setIndex(new THREE.BufferAttribute(g.index.array.slice(), 1));
  out.applyMatrix4(matrix);
  return out;
}
