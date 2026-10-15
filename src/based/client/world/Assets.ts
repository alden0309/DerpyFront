// The 3D models for Mr. Based's places (r21): Quaternius' mannequins and
// their clips, and Kenney's furniture and vans. Fetched through the game's
// API with the player's session (like the pictures), then decoded here.

import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
// BPEOPLE (r22): the people are built by People.ts from their own models.
import { CAST_MODELS, PEOPLE_MODELS, peopleAssets, Rig } from "./People";

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
  // BPEOPLE (r22): the bodies, their clips and the props; and the cast's
  // own models (welcome, but the game plays without them).
  const keys = ["props", ...PEOPLE_MODELS];
  const total = keys.length + CAST_MODELS.length;
  let done = 0;
  onProgress?.(0, total);
  const [loaded, own] = await Promise.all([
    Promise.all(
      keys.map(async (k) => {
        const g = await parse(await urlOf(k));
        onProgress?.(++done, total);
        return g;
      }),
    ),
    Promise.all(
      CAST_MODELS.map(async (k) => {
        const g = await urlOf(k)
          .then(parse)
          .catch(() => null);
        onProgress?.(++done, total);
        return g;
      }),
    ),
  ]);
  const byKey: Record<string, GLTF> = Object.fromEntries(
    keys.map((k, i) => [k, loaded[i]]),
  );
  CAST_MODELS.forEach((k, i) => {
    if (own[i]) byKey[k] = own[i];
  });
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
