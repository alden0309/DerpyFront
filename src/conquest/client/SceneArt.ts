// The painted backdrops of scenes: where something happens (a tavern by
// Teniers, a church by de Witte, the quays of Marseille by Vernet, a road by
// Hobbema, the council fire by Benjamin West, a lakeside village by Paul
// Kane...), and small versions of each for the tiles of a province's
// places. The paintings and who painted them are listed in Credits.ts.

import type { SoundKind } from "./Sound";

const BIG = import.meta.glob<string>("./art/scenes/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const SMALL = import.meta.glob<string>("./art/scenes/thumbs/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

function byName(files: Record<string, string>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [path, url] of Object.entries(files))
    m.set(path.replace(/^.*\//, "").replace(/\.webp$/, ""), url);
  return m;
}

const big = byName(BIG);
const small = byName(SMALL);

/** Scenes that borrow another's backdrop. */
const ALIAS: Record<string, string> = {
  court: "parliament",
  duel: "road",
  field: "fields",
  home: "home",
  sea: "deck",
  storm: "deck",
  town: "market",
  // LIFE (r11): new places and the road's own scenes, if their art is missing.
  den: "tavern",
  gaol: "fort",
  snow: "road",
  swamp: "woods",
  river: "road",
};

function key(scene: string): string {
  return big.has(scene) ? scene : (ALIAS[scene] ?? "home");
}

/** The backdrop for a scene (or a place). */
export function sceneArt(scene: string): string | null {
  return big.get(key(scene)) ?? big.get("home") ?? null;
}

/** The small picture of a place, for its tile. */
export function placeThumb(scene: string): string | null {
  const k = key(scene);
  return small.get(k) ?? big.get(k) ?? null;
}

/** Indoors (candlelight) or out (daylight). */
export function indoors(scene: string): boolean {
  return [
    "tavern",
    "church",
    "fort",
    "governor",
    "parliament",
    "court",
    "home",
    "workshop",
    "press",
    "apothecary",
    "letter",
    "den",
    "gaol",
  ].includes(key(scene));
}

/** The sound a scene opens with. */
export function sceneSound(scene: string): SoundKind {
  switch (key(scene)) {
    case "tavern":
    case "market":
      return "coins";
    case "church":
    case "docks":
    case "deck":
      return "bell";
    case "fort":
    case "councilfire":
    case "rising":
      return "drums";
    case "battle":
      return "cannon";
    case "letter":
      return "letter";
    case "governor":
    case "parliament":
      return "honour";
    default:
      return "paper";
  }
}
