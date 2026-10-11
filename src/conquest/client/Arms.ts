// A family's arms, drawn as SVG: a heater shield with its field, a division
// in a second tincture and a charge in a third. Native characters bear their
// clan's sign on a round hide shield instead.

import { html, svg, SVGTemplateResult, TemplateResult } from "lit";
import { TINCTURES } from "../engine/LifeRules";
import type { Charge, Sigil, Tincture } from "../engine/Types";

const col = (t: Tincture) => TINCTURES[t]?.color ?? "#999";

const SHIELD = "M4 4h52v24c0 15-11 24-26 30C15 52 4 43 4 28z";
const ROUND = "M30 4a26 26 0 1 0 0.01 0z";

/** A charge, drawn in a 24-unit box centred at 0,0 (flags use it too). */
export function chargePath(c: Charge): SVGTemplateResult {
  switch (c) {
    case "star":
      return svg`<path d="M0-11 3.2-3.5 11.4-3.4 4.9 1.6 7.1 9.6 0 4.9-7.1 9.6-4.9 1.6-11.4-3.4-3.2-3.5z"/>`;
    case "lion":
      return svg`<path d="M-7 10l1-6-3-3 2-5 4-1 1-4 3-2 3 2-1 3 3 1-2 3 2 3-3 1v4l2 4h-3l-2-4h-3l-1 4z"/><path d="M5 4c3-1 5-4 4-7" fill="none" stroke-width="1.6"/>`;
    case "fleur":
      return svg`<g transform="scale(1.35)"><path d="M0 -8c2.4 2 2.6 5 0 8-2.6-3-2.4-6 0-8z"/><path d="M0 0c-1.5-3-5.5-3.5-6.5-.5 2 0 3.5 1.2 3.8 3.2L0 2z"/><path d="M0 0c1.5-3 5.5-3.5 6.5-.5-2 0-3.5 1.2-3.8 3.2L0 2z"/><rect x="-4" y="2" width="8" height="1.8" rx=".6"/><path d="M-1 3.8h2l-.6 3.4h-.8z"/></g>`;
    case "anchor":
      return svg`<path d="M-1.4-6h2.8v12h-2.8z"/><circle cx="0" cy="-8" r="2.4" fill="none" stroke-width="1.6"/><path d="M-6-3h12v2h-12z"/><path d="M-9 3c1 5 5 7 9 7s8-2 9-7l-2.5 1c-1 3-3.5 4-6.5 4s-5.5-1-6.5-4z"/>`;
    case "tree":
      return svg`<path d="M0-11l6 7h-3l5 6h-3l5 6H-10l5-6h-3l5-6h-3z"/><path d="M-1.5 8h3v4h-3z"/>`;
    case "ship":
      return svg`<path d="M-10 4h20l-4 6h-12z"/><path d="M-1-10h1.6v14H-1z"/><path d="M1-9c5 2 6 6 5 11H1z"/><path d="M-2-7c-4 2-5 5-5 9h5z"/>`;
    case "key":
      return svg`<circle cx="0" cy="-6" r="4.4" fill="none" stroke-width="2.4"/><path d="M-1.3-1.8h2.6V11h-2.6z"/><path d="M1 6h4v2H1zM1 9h3v2H1z"/>`;
    case "crescent":
      return svg`<path d="M-2-10a10 10 0 1 0 9 15A8 8 0 1 1-2-10z"/>`;
    case "heart":
      return svg`<path d="M0 9C-9 3-10-2-8-6s7-4 8 0c1-4 6-4 8 0s1 9-8 15z"/>`;
    case "bird":
      return svg`<path d="M-10 0c4-1 7-4 9-7l2 4c3-1 6-1 8 1-3 0-5 1-6 3l2 5-4-2-3 4-1-5c-3 0-5-1-7-3z"/>`;
    case "wheat":
      return svg`<path d="M-1 -4h2v15h-2z"/><path d="M0-11c3 2 3 5 0 7-3-2-3-5 0-7zM-5-7c3 1 4 4 3 6-3-1-4-4-3-6zM5-7c-3 1-4 4-3 6 3-1 4-4 3-6zM-6-1c3 1 4 4 3 6-3-1-4-4-3-6zM6-1c-3 1-4 4-3 6 3-1 4-4 3-6z"/><path d="M-6 4h12v2h-12z"/>`;
    case "tower":
      return svg`<path d="M-7-10h3v3h2.5v-3h3v3h2.5v-3h3v6l-2 2v12h-10V-2l-2-2z"/><path d="M-1.5 5h3v5h-3z" fill="rgba(0,0,0,.35)" stroke="none"/>`;
    case "sword":
      return svg`<path d="M-1.2-12h2.4l.6 15h-3.6z"/><path d="M-6 3h12v2.2h-12z"/><path d="M-1.4 5h2.8v5h-2.8z"/><circle cx="0" cy="11.5" r="1.8"/>`;
    case "beaver":
      return svg`<path d="M-9 2c0-5 4-8 9-8 4 0 7 2 8 5l3 1-2 2c-1 3-5 5-9 5h-7c-2 0-2-2-2-5z"/><path d="M-9 4c-3 1-3 5 0 6l3-3z"/><circle cx="6" cy="-3" r="1" fill="rgba(0,0,0,.6)" stroke="none"/>`;
    case "turtle":
      return svg`<ellipse cx="0" cy="0" rx="7.5" ry="9"/><circle cx="0" cy="-11" r="2.6"/><path d="M-7-6l-4-2 1 4zM7-6l4-2-1 4zM-7 6l-4 2 1-4zM7 6l4 2-1-4zM-1 9l1 4 1-4z"/><path d="M0-7v14M-5-3h10M-5 3h10" stroke="rgba(0,0,0,.35)" stroke-width="1" fill="none"/>`;
    case "wolf":
      return svg`<path d="M-10 4l3-5 1-5 3 2 2-4 1 4c3 0 6 1 8 3l2 5-3 1-2-2-2 6h-2l-1-4h-4l-2 4h-2l1-5z"/><path d="M8 4c3 2 4 5 3 8" fill="none" stroke-width="1.6"/>`;
    case "bear":
      return svg`<path d="M-11 6c0-6 3-10 9-10 2-3 6-3 8 0 3 0 5 2 5 5l-2 1c0 2-1 4-3 4v4h-3v-3h-6v3h-3v-3c-3 0-5-1-5-1z"/><circle cx="1" cy="-5" r="1.8"/>`;
    case "deer":
      return svg`<path d="M-8 10l1-8c-1-2 0-4 2-5h7l2-4 2 1-1 4 2 1-2 3v8h-2V4h-6l-1 6z"/><path d="M5-6l-2-6M3-9l-3-2M6-7l3-5M8-10l3 0" fill="none" stroke-width="1.4"/>`;
    case "feather":
      return svg`<path d="M5-11C-3-7-6 2-4 9l-3 3 1 1 3-3c7 0 11-9 8-21z"/><path d="M4-8L-4 10" stroke="rgba(0,0,0,.35)" stroke-width="1" fill="none"/>`;
    case "none":
    default:
      return svg``;
  }
}

function division(s: Sigil, clip: string): SVGTemplateResult {
  const t = col(s.tincture);
  switch (s.division) {
    case "pale":
      return svg`<rect x="30" y="0" width="30" height="62" fill=${t} clip-path=${clip}/>`;
    case "fess":
      return svg`<rect x="0" y="30" width="60" height="32" fill=${t} clip-path=${clip}/>`;
    case "bend":
      return svg`<path d="M0 0 60 62H0z" fill=${t} clip-path=${clip}/>`;
    case "chevron":
      return svg`<path d="M0 50 30 22 60 50V36L30 8 0 36z" fill=${t} clip-path=${clip}/>`;
    case "quarterly":
      return svg`<path d="M30 0h30v30H30zM0 30h30v32H0z" fill=${t} clip-path=${clip}/>`;
    case "saltire":
      return svg`<path d="M0 0 60 62M60 0 0 62" stroke=${t} stroke-width="10" clip-path=${clip}/>`;
    case "cross":
      return svg`<path d="M25 0h10v62H25zM0 21h60v10H0z" fill=${t} clip-path=${clip}/>`;
    case "chief":
      return svg`<rect x="0" y="0" width="60" height="18" fill=${t} clip-path=${clip}/>`;
    default:
      return svg``;
  }
}

let uid = 0;

/** The arms, as an inline SVG. `native`: a clan sign on a round shield. */
export function arms(
  s: Sigil,
  cls = "cq-arms",
  native = false,
  label = "Arms",
): TemplateResult {
  const id = `cqa${++uid}`;
  const outline = native ? ROUND : SHIELD;
  const charge = s.charge;
  // Where the charge sits: lower when there's a chief, centred otherwise.
  const cy = s.division === "chief" ? 36 : 30;
  return html`<svg
    class=${cls}
    viewBox="0 0 60 62"
    role="img"
    aria-label=${label}
  >
    <defs>
      <clipPath id=${id}><path d=${outline} /></clipPath>
      <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".28" />
        <stop offset=".55" stop-color="#fff" stop-opacity="0" />
        <stop offset="1" stop-color="#000" stop-opacity=".22" />
      </linearGradient>
    </defs>
    <path d=${outline} fill=${col(s.field)} />
    ${division(s, `url(#${id})`)}
    ${charge !== "none"
      ? svg`<g transform="translate(30 ${cy}) scale(1.05)" fill=${col(s.chargeTincture)} stroke=${col(s.chargeTincture)} stroke-width="0.6" stroke-linejoin="round">${chargePath(charge)}</g>`
      : svg``}
    <path d=${outline} fill="url(#${id}g)" />
    <path
      d=${outline}
      fill="none"
      stroke="#3a2a16"
      stroke-width="2"
      stroke-linejoin="round"
    />
    ${native
      ? svg`<path d="M6 30h-5M54 30h5" stroke="#3a2a16" stroke-width="2"/><path d="M2 34l-1 9M58 34l1 9" stroke=${col(s.tincture)} stroke-width="2.4" stroke-linecap="round"/>`
      : svg``}
  </svg>`;
}
