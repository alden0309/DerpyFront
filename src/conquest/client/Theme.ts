// A nation's colours as CSS variables: its colour, two darker shades for
// edges and shadows, and an ink that reads on it (dark on Spain's gold,
// pale on England's red).

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function inkOn(hex: string): string {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.3 ? "#24170d" : "#fbf1dc";
}

export function shade(hex: string, k: number): string {
  const ch = rgb(hex).map((v) => Math.round(v * k));
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

/** Inline style setting --nation and friends. */
export function nationVars(color: string): string {
  const ink = inkOn(color);
  return `--nation:${color};--nation-deep:${shade(color, 0.62)};--nation-dark:${shade(color, 0.38)};--nation-ink:${ink};--btn-ink:${ink}`;
}
