// The map's pictures: period engravings of ships, soldiers, towns and forts
// (see Credits.ts), and the textures for paper, sea and country. Loaded
// once; until a picture arrives the map draws its own simple stand-in.

import artillery from "./art/artillery.webp?url";
import canoe from "./art/canoe.webp?url";
import dragoons from "./art/dragoons.webp?url";
import explorer from "./art/explorer.webp?url";
import forest from "./art/forest.webp?url";
import fort from "./art/fort.webp?url";
import hills from "./art/hills.webp?url";
import marsh from "./art/marsh.webp?url";
import militia from "./art/militia.webp?url";
import mountains from "./art/mountains.webp?url";
import nativeVillage from "./art/native_village.webp?url";
import paper from "./art/paper.webp?url";
import regulars from "./art/regulars.webp?url";
import sea from "./art/sea.webp?url";
import ship from "./art/ship.webp?url";
import shipSmall from "./art/ship_small.webp?url";
import townBig from "./art/town_big.webp?url";
import townSmall from "./art/town_small.webp?url";
import tradingPost from "./art/trading_post.webp?url";
import warriors from "./art/warriors.webp?url";

const URLS = {
  artillery,
  canoe,
  dragoons,
  explorer,
  forest,
  fort,
  hills,
  marsh,
  militia,
  mountains,
  nativeVillage,
  paper,
  regulars,
  sea,
  ship,
  shipSmall,
  townBig,
  townSmall,
  tradingPost,
  warriors,
};

export type SpriteName = keyof typeof URLS;

const images = new Map<SpriteName, HTMLImageElement>();
const ready = new Set<SpriteName>();
let onLoad: (() => void) | null = null;

/** Start loading everything; `loaded` is called as each picture arrives. */
export function loadSprites(loaded: () => void): void {
  onLoad = loaded;
  for (const [name, url] of Object.entries(URLS) as [SpriteName, string][]) {
    if (images.has(name)) continue;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      ready.add(name);
      onLoad?.();
    };
    img.src = url;
    images.set(name, img);
  }
}

/** The picture, if it has loaded. */
export function sprite(name: SpriteName): HTMLImageElement | null {
  return ready.has(name) ? images.get(name)! : null;
}

/**
 * Draw a picture standing on (x, y), `h` pixels tall, facing right unless
 * `flip`. Returns false if it hasn't loaded yet.
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  name: SpriteName,
  x: number,
  y: number,
  h: number,
  flip = false,
  anchor: "bottom" | "center" = "bottom",
): boolean {
  const img = sprite(name);
  if (!img) return false;
  const w = (img.naturalWidth / img.naturalHeight) * h;
  const top = anchor === "bottom" ? y - h : y - h / 2;
  if (flip) {
    ctx.save();
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, top, w, h);
    ctx.restore();
  } else ctx.drawImage(img, x - w / 2, top, w, h);
  return true;
}

/** Width a picture would take at height `h`. */
export function spriteWidth(name: SpriteName, h: number): number {
  const img = sprite(name);
  return img ? (img.naturalWidth / img.naturalHeight) * h : h;
}

/**
 * Draw a picture standing on (x, y), tilted by `angle` radians about its
 * feet (a marching soldier's sway). Returns false if it hasn't loaded yet.
 */
export function drawSpriteTilted(
  ctx: CanvasRenderingContext2D,
  name: SpriteName,
  x: number,
  y: number,
  h: number,
  flip: boolean,
  angle: number,
): boolean {
  const img = sprite(name);
  if (!img) return false;
  const w = (img.naturalWidth / img.naturalHeight) * h;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.restore();
  return true;
}
