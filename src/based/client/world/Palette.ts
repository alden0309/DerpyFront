// BFIX (r23): the named materials of the props modelled for Mr. Based in
// Autodesk Fusion (models/fusion_props.glb). Each of their meshes is named
// for its material (leather, brass, glass...), and the kit gives it the
// palette's material of that name: one material per name, shared by every
// prop and every place, so the world's static merge draws all of a place's
// brass (or leather, or iron) in one draw. Tuned for the noir lighting: the
// colours sit low (sodium and tungsten do the rest), brass and the hubs are
// metal, glass is dark and glossy, lamps and lights glow.
//
// A place can still recolour a prop's material (`"mats": { "paint":
// "#4a3a3a" }`, or `"tint"` for its paint), so two parked cars can differ:
// the recoloured material keeps the palette's finish and is shared too.

import * as THREE from "three";

export interface Finish {
  color: string;
  roughness: number;
  metalness: number;
  /** Lit from inside: a lantern's panes, a car's lamps. */
  emissive?: string;
  emissiveIntensity?: number;
  /** How much of the room it reflects (glass, polished brass). */
  env?: number;
}

/** The props' materials by name. */
export const PALETTE: Record<string, Finish> = {
  // The bar.
  leather: { color: "#4b1714", roughness: 0.48, metalness: 0, env: 1.2 },
  wood: { color: "#33200f", roughness: 0.42, metalness: 0, env: 1.1 },
  iron: { color: "#141517", roughness: 0.42, metalness: 0.75 },
  brass: { color: "#b38a42", roughness: 0.26, metalness: 1, env: 1.6 },
  marble: { color: "#bdb7aa", roughness: 0.2, metalness: 0, env: 1.3 },
  rattan: { color: "#8a6a3e", roughness: 0.72, metalness: 0 },
  // The street.
  iron_green: { color: "#183024", roughness: 0.46, metalness: 0.55 },
  slat: { color: "#553a22", roughness: 0.62, metalness: 0 },
  bag: { color: "#2c5531", roughness: 0.38, metalness: 0, env: 1.3 },
  poster: { color: "#c8b48a", roughness: 0.7, metalness: 0 },
  // The cars and the van.
  paint: { color: "#262f42", roughness: 0.32, metalness: 0.15, env: 1.4 },
  paint_white: { color: "#d6d7d2", roughness: 0.34, metalness: 0.1, env: 1.2 },
  stripe_blue: { color: "#1b3585", roughness: 0.38, metalness: 0.2 },
  stripe_red: { color: "#9e2229", roughness: 0.38, metalness: 0.2 },
  lightbar: {
    color: "#2341b0",
    roughness: 0.18,
    metalness: 0,
    emissive: "#1a2c8a",
    emissiveIntensity: 0.35,
    env: 1.4,
  },
  glass: { color: "#0a0e13", roughness: 0.05, metalness: 0.7, env: 2.2 },
  tyre: { color: "#0b0b0c", roughness: 0.88, metalness: 0 },
  hub: { color: "#8b8d91", roughness: 0.3, metalness: 0.9, env: 1.4 },
  trim: { color: "#17181a", roughness: 0.55, metalness: 0.3 },
  light_white: {
    color: "#d8d0bc",
    roughness: 0.2,
    metalness: 0,
    emissive: "#fff0d0",
    emissiveIntensity: 0.55,
  },
  light_red: {
    color: "#5a0c0c",
    roughness: 0.25,
    metalness: 0,
    emissive: "#c01818",
    emissiveIntensity: 0.45,
  },
  // The street lamp: lantern panes and bulb lit.
  glass_lamp: {
    color: "#ffd9a0",
    roughness: 0.3,
    metalness: 0,
    emissive: "#ffcf8a",
    emissiveIntensity: 2.2,
  },
  lamp_bulb: {
    color: "#fff2cf",
    roughness: 0.3,
    metalness: 0,
    emissive: "#fff0c8",
    emissiveIntensity: 3,
  },
};

/**
 * Names drawn with another's material, where the eye can't tell them apart
 * at night and a draw is saved: the tyres with the black trim, the bulb
 * with its lit lantern.
 */
const DRAWN_AS: Record<string, string> = {
  tyre: "trim",
  lamp_bulb: "glass_lamp",
};

/** The material names a prop's mesh may carry ("leather (3)" is leather). */
export function paletteName(name: string): string | null {
  const base = name.replace(/\s*\(\d+\)\s*$/, "").trim();
  return base in PALETTE ? base : null;
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * The palette's material of a name, in its own colour or another (a
 * recolour keeps the finish). Shared: the same object for the same name and
 * colour, kept for every place.
 */
export function paletteMaterial(
  name: string,
  color?: string,
): THREE.MeshStandardMaterial {
  if (!color && DRAWN_AS[name]) name = DRAWN_AS[name];
  const f = PALETTE[name];
  const c = new THREE.Color(color ?? f.color);
  const key = `${name}|${c.getHexString()}`;
  let m = cache.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({
    color: c,
    roughness: f.roughness,
    metalness: f.metalness,
    envMapIntensity: f.env ?? 1,
  });
  if (f.emissive) {
    m.emissive = new THREE.Color(f.emissive);
    m.emissiveIntensity = f.emissiveIntensity ?? 1;
  }
  m.name = name;
  m.userData.shared = true;
  m.userData.palette = name;
  cache.set(key, m);
  return m;
}
