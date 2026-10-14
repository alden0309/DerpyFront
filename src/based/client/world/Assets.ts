// The 3D models for Mr. Based's places (r21): Quaternius' mannequins and
// their clips, and Kenney's furniture and vans. Fetched through the game's
// API with the player's session (like the pictures), then decoded here.

import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { gestureClips, Rig } from "./People";

export interface WorldAssets {
  rigs: { m: Rig; f: Rig };
  gestures: Map<string, THREE.AnimationClip>;
  /** Props by name: stoolBar, chair, van... */
  props: Map<string, THREE.Object3D>;
}

function parse(url: string): Promise<GLTF> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader.loadAsync(url);
}

/**
 * Loads the models; `urlOf` turns a key (mannequin_m, mannequin_f, props)
 * into a URL the loader can read (an object URL of a fetched blob).
 */
export async function loadWorldAssets(
  urlOf: (key: string) => Promise<string>,
  onProgress?: (done: number, total: number) => void,
): Promise<WorldAssets> {
  const keys = ["mannequin_m", "mannequin_f", "props"] as const;
  let done = 0;
  onProgress?.(0, keys.length);
  const [m, f, props] = await Promise.all(
    keys.map(async (k) => {
      const g = await parse(await urlOf(k));
      onProgress?.(++done, keys.length);
      return g;
    }),
  );
  const clips = m.animations;
  const byName = new Map<string, THREE.Object3D>();
  for (const child of props.scene.children) {
    byName.set(child.name, child);
  }
  return {
    rigs: {
      m: { scene: m.scene, clips },
      f: { scene: f.scene, clips },
    },
    gestures: gestureClips(clips),
    props: byName,
  };
}
