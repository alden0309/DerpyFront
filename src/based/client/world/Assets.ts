// The 3D models for Mr. Based's places (r21): Quaternius' mannequins and
// their clips, and Kenney's furniture and vans. Fetched through the game's
// API with the player's session (like the pictures), then decoded here.

import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
// BPEOPLE (r22): the people are built by People.ts from their own models.
import { PEOPLE_MODELS, peopleAssets, Rig } from "./People";

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
  // BPEOPLE (r22): the bodies, their clips and the props.
  const keys = ["props", ...PEOPLE_MODELS];
  let done = 0;
  onProgress?.(0, keys.length);
  const loaded = await Promise.all(
    keys.map(async (k) => {
      const g = await parse(await urlOf(k));
      onProgress?.(++done, keys.length);
      return g;
    }),
  );
  const byKey = Object.fromEntries(keys.map((k, i) => [k, loaded[i]]));
  const props = byKey.props;
  const byName = new Map<string, THREE.Object3D>();
  for (const child of props.scene.children) {
    byName.set(child.name, child);
  }
  // A cast member's own model (model=key) is fetched when they first appear.
  const people = peopleAssets(byKey, async (k) => parse(await urlOf(k)));
  return {
    rigs: people.rigs,
    gestures: people.gestures,
    props: byName,
  };
}
