// Where the gallery's pictures are: for each painting (engine/Gallery.ts) a
// head-and-shoulders crop, a small one for lists, and its masks (hair in
// red, clothes in green, the figure itself in blue). Only their addresses
// are in the bundle (never the pictures themselves, however small); a
// picture is fetched the first time it's shown.

const FULL = import.meta.glob<string>("./portraits/full/*.webp", {
  eager: true,
  query: "?url&no-inline",
  import: "default",
});
const THUMB = import.meta.glob<string>("./portraits/thumb/*.webp", {
  eager: true,
  query: "?url&no-inline",
  import: "default",
});
const MASK = import.meta.glob<string>("./portraits/mask/*.webp", {
  eager: true,
  query: "?url&no-inline",
  import: "default",
});

function byId(files: Record<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [path, url] of Object.entries(files))
    out.set(path.replace(/^.*\//, "").replace(/\.webp$/, ""), url);
  return out;
}

const full = byId(FULL);
const thumb = byId(THUMB);
const mask = byId(MASK);

/** The picture, 480 by 600. */
export function fullUrl(id: string): string | null {
  return full.get(id) ?? null;
}

/** The picture small, 144 by 180, for lists and the gallery's grid. */
export function thumbUrl(id: string): string | null {
  return thumb.get(id) ?? full.get(id) ?? null;
}

/** Its masks, 240 by 300: hair (red), clothes (green), the figure (blue). */
export function maskUrl(id: string): string | null {
  return mask.get(id) ?? null;
}

/** Whether a picture's files are all here. */
export function hasPicture(id: string): boolean {
  return full.has(id) && thumb.has(id) && mask.has(id);
}
