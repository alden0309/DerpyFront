// Mr. Based's things, drawn (r22 BPLAY): ink line drawings for the
// inventory, one per kind of thing (a jacket, a matchbook, an umbrella...),
// and his figure for the slots to sit around. The story names a drawing
// with `icon=` on an @item; anything without one gets its kind's. Only
// shapes here: no item's name or words from the story.

import { svg, SVGTemplateResult } from "lit";

type Draw = () => SVGTemplateResult;

/** Each drawing in a 64 × 64 box: ink lines, a little hatching. */
const DRAWINGS: Record<string, Draw> = {
  jacket: () => svg`
    <path d="M24 9 L32 13 L40 9 L50 14 L56 50 L47 52 L45 31 L44 56 L20 56 L19 31 L17 52 L8 50 L14 14 Z" />
    <path d="M32 13 L32 56" />
    <path d="M27 10 L29 6 L35 6 L37 10" />
    <path d="M23 34 h6 M35 34 h6 M23 44 h6 M35 44 h6" class="thin" />
    <path d="M30 18 l2 2 l2 -2" class="thin" />`,
  tee: () => svg`
    <path d="M22 10 Q32 17 42 10 L56 18 L50 28 L44 25 L44 55 L20 55 L20 25 L14 28 L8 18 Z" />
    <path d="M24 11 Q32 21 40 11" class="thin" />
    <path d="M24 40 l3 -3 M24 46 l6 -6 M28 48 l6 -6" class="hatch" />`,
  trousers: () => svg`
    <path d="M18 8 H46 L50 57 H37 L32 22 L27 57 H14 Z" />
    <path d="M18 14 H46" class="thin" />
    <path d="M17 32 h8 v10 h-8 z M39 32 h8 v10 h-8 z" class="thin" />
    <path d="M32 14 v8" class="thin" />`,
  boots: () => svg`
    <path d="M12 12 H26 L27 40 L44 44 Q53 46 53 52 V56 H12 Z" />
    <path d="M12 50 H53" class="thin" />
    <path d="M17 18 h7 M17 24 h7 M17 30 h7" class="thin" />
    <path d="M14 56 v3 M50 56 v3" class="thin" />`,
  gloves: () => svg`
    <path d="M16 56 V34 L12 22 Q12 18 15 19 L19 28 V12 Q19 9 22 10 L23 26 V8 Q24 5 27 7 L27 26 L28 10 Q30 8 32 11 L31 30 L34 24 Q37 21 38 25 L34 40 V56 Z" />
    <path d="M18 48 H34" class="thin" />
    <path d="M38 56 V40 L42 30 Q44 27 46 30 L44 40 L48 20 Q50 17 52 20 L50 38 L54 26 Q57 24 57 28 L53 46 V56 Z" class="thin" />`,
  phone: () => svg`
    <rect x="21" y="8" width="22" height="48" rx="4" />
    <rect x="25" y="14" width="14" height="22" class="thin" />
    <path d="M27 42 h3 M34 42 h3 M27 47 h3 M34 47 h3 M27 52 h3 M34 52 h3" class="thin" />`,
  passport: () => svg`
    <rect x="16" y="8" width="32" height="46" rx="2" />
    <circle cx="32" cy="27" r="8" class="thin" />
    <path d="M24 27 h16 M32 19 v16 M26 22 Q32 27 26 32 M38 22 Q32 27 38 32" class="thin" />
    <path d="M22 44 h20 M25 48 h14" class="thin" />`,
  matchbook: () => svg`
    <path d="M14 20 H50 V50 H14 Z" />
    <path d="M14 30 H50" class="thin" />
    <path d="M20 20 V10 M24 20 V9 M28 20 V10 M32 20 V9 M36 20 V10 M40 20 V9 M44 20 V10" class="thin" />
    <path d="M18 10 h4 M30 9 h4 M42 10 h4" />
    <path d="M18 38 h28 M22 43 h20" class="thin" />`,
  cigarettes: () => svg`
    <path d="M16 18 H44 V56 H16 Z" />
    <path d="M44 18 L50 14 V52 L44 56" />
    <path d="M16 18 L22 14 H50" />
    <path d="M24 18 V8 M30 18 V6 M36 18 V9" />
    <path d="M24 8 v3 M30 6 v3" class="thin" />
    <path d="M20 34 h20 M20 40 h14" class="thin" />`,
  newspaper: () => svg`
    <path d="M10 12 H50 V54 H14 Q10 54 10 50 Z" />
    <path d="M50 20 H56 V50 Q56 54 52 54 H14" />
    <path d="M15 18 H45" />
    <path d="M15 24 H45" class="thin" />
    <rect x="15" y="29" width="13" height="11" class="thin" />
    <path d="M31 30 h14 M31 34 h14 M31 38 h14 M15 44 h30 M15 48 h30" class="hatch" />`,
  umbrella: () => svg`
    <path d="M8 30 Q32 2 56 30 Q50 26 44 30 Q38 26 32 30 Q26 26 20 30 Q14 26 8 30 Z" />
    <path d="M32 9 V52 Q32 58 26 57 Q22 56 23 52" />
    <path d="M32 9 V5" />
    <path d="M20 30 Q24 16 32 10 M44 30 Q40 16 32 10" class="thin" />`,
  glasses: () => svg`
    <circle cx="20" cy="34" r="10" />
    <circle cx="44" cy="34" r="10" />
    <path d="M30 32 Q32 29 34 32" />
    <path d="M10 31 L4 24 M54 31 L60 24" />
    <path d="M14 30 l4 -4 M38 30 l4 -4" class="thin" />`,
  scarf: () => svg`
    <path d="M14 10 Q32 22 50 10 L52 18 Q32 32 12 18 Z" />
    <path d="M38 24 L44 56 H34 L30 26" />
    <path d="M35 56 v4 M38 56 v4 M41 56 v4" class="thin" />
    <path d="M32 32 h8 M33 38 h8 M34 44 h8 M35 50 h8" class="hatch" />`,
  cap: () => svg`
    <path d="M10 38 Q12 18 34 16 Q54 16 56 32 L58 38 Q40 34 10 38 Z" />
    <path d="M10 38 Q28 46 58 38" />
    <path d="M20 28 l4 -6 M28 26 l4 -6 M36 26 l4 -6 M44 28 l4 -6" class="hatch" />`,
  lighter: () => svg`
    <rect x="20" y="22" width="24" height="34" rx="3" />
    <path d="M20 30 H44" class="thin" />
    <path d="M22 22 V12 H36 V22" />
    <circle cx="27" cy="16" r="2" class="thin" />
    <path d="M38 10 Q42 4 40 0 Q46 6 42 12" class="thin" />`,
  baton: () => svg`
    <path d="M10 54 L22 42" stroke-width="6" />
    <path d="M22 42 L38 26" stroke-width="3.6" />
    <path d="M38 26 L54 10" stroke-width="2.4" />
    <circle cx="55" cy="9" r="2.4" />
    <path d="M10 49 l5 5 M13 46 l5 5" class="thin" />`,
  card: () => svg`
    <path d="M8 20 H56 V46 H8 Z" />
    <path d="M14 29 Q20 25 24 29 T34 29" class="thin" />
    <path d="M14 37 H40" class="thin" />
    <path d="M44 36 l6 -6" class="hatch" />`,
  key: () => svg`
    <circle cx="18" cy="32" r="9" />
    <circle cx="18" cy="32" r="3" class="thin" />
    <path d="M27 32 H56 M48 32 v7 M53 32 v5" />`,
  document: () => svg`
    <path d="M14 8 H40 L50 18 V56 H14 Z" />
    <path d="M40 8 V18 H50" class="thin" />
    <path d="M20 26 h24 M20 32 h24 M20 38 h24 M20 44 h14" class="hatch" />`,
  glass: () => svg`
    <path d="M20 14 H44 L41 54 H23 Z" />
    <path d="M22 32 H42" class="thin" />
    <path d="M24 38 l4 -4 M28 44 l8 -8 M30 50 l9 -9" class="hatch" />`,
  watch: () => svg`
    <circle cx="32" cy="32" r="13" />
    <path d="M32 24 V32 L38 35" class="thin" />
    <path d="M25 20 L27 6 H37 L39 20 M25 44 L27 58 H37 L39 44" />`,
  thing: () => svg`
    <path d="M14 22 L32 12 L50 22 V44 L32 54 L14 44 Z" />
    <path d="M14 22 L32 32 L50 22 M32 32 V54" class="thin" />`,
};

/** What each kind of thing is drawn as when its @item names no drawing. */
const BY_KIND: Record<string, string> = {
  clothes: "tee",
  tool: "thing",
  weapon: "baton",
  document: "document",
  key: "key",
  small: "thing",
};

/** The drawings there are (the tests check every icon= names one). */
export const ITEM_DRAWINGS = Object.keys(DRAWINGS);

/** An item's picture: its own drawing, or its kind's. */
export function itemArt(
  icon: string | undefined,
  kind: string,
  size = 56,
): SVGTemplateResult {
  const draw = DRAWINGS[icon ?? ""] ?? DRAWINGS[BY_KIND[kind] ?? "thing"];
  return svg`<svg
    class="mb-ink"
    viewBox="0 0 64 64"
    width=${size}
    height=${size}
    aria-hidden="true"
  >
    ${draw()}
  </svg>`;
}

/**
 * His figure, standing, for the slots to sit around: ink on paper, the
 * way a tailor or a property clerk would sketch him. Points for the leader
 * lines from each slot are in FIGURE_POINTS (the same 200 × 400 box).
 */
export function figureArt(): SVGTemplateResult {
  return svg`<svg
    class="mb-figure-ink"
    viewBox="0 0 200 400"
    preserveAspectRatio="xMidYMid meet"
    aria-hidden="true"
  >
    <g class="body">
      <path d="M86 52 Q84 20 100 18 Q117 20 114 52 Q112 66 100 70 Q88 66 86 52 Z" />
      <path d="M90 64 V78 H110 V64" />
      <path d="M66 86 Q100 74 134 86 L146 104 L158 196 L148 230 L138 230 L144 196 L134 128 L132 200 L68 200 L66 128 L56 196 L62 230 L52 230 L42 196 L54 104 Z" />
      <path d="M100 80 V200" class="thin" />
      <path d="M92 78 L100 88 L108 78" class="thin" />
      <path d="M72 120 h18 M110 120 h18" class="thin" />
      <path d="M70 200 L64 352 H92 L100 228 L108 352 H136 L130 200" />
      <path d="M64 352 L58 372 H94 L92 352 M136 352 L142 372 H106 L108 352" />
      <path d="M72 260 h14 v22 h-14 z M114 260 h14 v22 h-14 z" class="thin" />
      <path d="M50 230 Q48 244 56 246 Q64 244 62 230 M138 230 Q136 244 144 246 Q152 244 150 230" />
      <path d="M140 206 h12 v8 h-12 z" class="thin" />
    </g>
    <g class="hatch">
      <path d="M70 140 l10 -10 M70 156 l18 -18 M70 172 l22 -22 M72 188 l24 -24" />
      <path d="M108 150 l20 -20 M106 168 l24 -24 M108 186 l22 -22" />
      <path d="M66 330 l14 -14 M68 344 l20 -20 M114 344 l20 -20 M112 330 l14 -14" />
    </g>
  </svg>`;
}

/** Where on the figure each slot's line ends, in the figure's 200 × 400 box. */
export const FIGURE_POINTS: Record<string, [number, number]> = {
  hat: [100, 22],
  glasses: [108, 44],
  neck: [100, 76],
  jacket: [76, 118],
  shirt: [104, 104],
  gloves: [56, 240],
  hand: [146, 240],
  trousers: [118, 280],
  shoes: [80, 364],
};
