// The colonial powers' flags as they flew around 1607, drawn as SVG, and a
// plain emblem in a native nation's colour (they didn't fly flags).

import { html, svg, TemplateResult } from "lit";
import type { NationFlag } from "../engine/Types";
import { chargePath } from "./Arms";

export function flag(key: string, cls = "cq-flag"): TemplateResult {
  switch (key) {
    case "england":
      // St George's cross.
      return html`<svg class=${cls} viewBox="0 0 60 40" aria-hidden="true">
        <rect width="60" height="40" fill="#f6f1e3" />
        <rect x="25" width="10" height="40" fill="#c8102e" />
        <rect y="15" width="60" height="10" fill="#c8102e" />
      </svg>`;
    case "france":
      // Azure, three fleurs-de-lis or.
      return html`<svg class=${cls} viewBox="0 0 60 40" aria-hidden="true">
        <rect width="60" height="40" fill="#1f3f8f" />
        ${[
          [18, 13],
          [42, 13],
          [30, 29],
        ].map(
          ([x, y]) => svg`<g transform="translate(${x} ${y})" fill="#e8c14a">
            <path d="M0 -8c2.4 2 2.6 5 0 8-2.6-3-2.4-6 0-8z" />
            <path d="M0 0c-1.5-3-5.5-3.5-6.5-.5 2 0 3.5 1.2 3.8 3.2L0 2z" />
            <path d="M0 0c1.5-3 5.5-3.5 6.5-.5-2 0-3.5 1.2-3.8 3.2L0 2z" />
            <rect x="-4" y="2" width="8" height="1.8" rx=".6" />
            <path d="M-1 3.8h2l-.6 3.4h-.8z" />
          </g>`,
        )}
      </svg>`;
    case "spain":
      // The Cross of Burgundy: a ragged red saltire on white.
      return html`<svg class=${cls} viewBox="0 0 60 40" aria-hidden="true">
        <rect width="60" height="40" fill="#f6f1e3" />
        <g stroke="#b3202a" stroke-width="5" stroke-linecap="round">
          <path d="M8 4 52 36M52 4 8 36" />
        </g>
        <g fill="#b3202a">
          ${[
            [17, 10.5],
            [26, 17],
            [34, 23],
            [43, 29.5],
            [43, 10.5],
            [34, 17],
            [26, 23],
            [17, 29.5],
          ].map(([x, y]) => svg`<circle cx=${x} cy=${y} r="2.8" />`)}
        </g>
      </svg>`;
    case "portugal":
      // The royal arms on white: shields of the quinas in a red bordure of castles.
      return html`<svg class=${cls} viewBox="0 0 60 40" aria-hidden="true">
        <rect width="60" height="40" fill="#f6f1e3" />
        <path d="M18 7h24v14c0 8-6 12-12 13-6-1-12-5-12-13z" fill="#b3202a" />
        <path
          d="M21.5 10h17v11c0 6-4.2 9-8.5 10-4.3-1-8.5-4-8.5-10z"
          fill="#f6f1e3"
        />
        ${[
          [30, 14],
          [25.5, 19],
          [34.5, 19],
          [30, 19],
          [30, 24],
        ].map(
          ([x, y]) =>
            svg`<rect x=${x - 1.8} y=${y - 2} width="3.6" height="4.2" rx="1" fill="#1f3f8f" />`,
        )}
        ${[
          [20, 9],
          [40, 9],
          [19.5, 16],
          [40.5, 16],
          [21, 24],
          [39, 24],
          [30, 32],
        ].map(
          ([x, y]) =>
            svg`<rect x=${x - 1.2} y=${y - 1.2} width="2.4" height="2.4" fill="#e8c14a" />`,
        )}
      </svg>`;
    case "netherlands":
      // The Prince's Flag: orange, white, blue.
      return html`<svg class=${cls} viewBox="0 0 60 40" aria-hidden="true">
        <rect width="60" height="13.4" fill="#e8762b" />
        <rect y="13.3" width="60" height="13.4" fill="#f6f1e3" />
        <rect y="26.6" width="60" height="13.4" fill="#21468b" />
      </svg>`;
    case "sweden":
      return html`<svg class=${cls} viewBox="0 0 60 40" aria-hidden="true">
        <rect width="60" height="40" fill="#1f5aa6" />
        <rect x="17" width="8" height="40" fill="#f2c230" />
        <rect y="16" width="60" height="8" fill="#f2c230" />
      </svg>`;
    default:
      return html`<svg class=${cls} viewBox="0 0 60 40" aria-hidden="true">
        <rect width="60" height="40" fill="#e9dcc0" />
      </svg>`;
  }
}

/** A native nation's emblem: their colour, with a feathered disc. */
export function emblem(color: string, cls = "cq-flag"): TemplateResult {
  return html`<svg class=${cls} viewBox="0 0 60 40" aria-hidden="true">
    <rect width="60" height="40" fill="#efe3c7" />
    <circle cx="30" cy="20" r="13" fill=${color} />
    <circle
      cx="30"
      cy="20"
      r="13"
      fill="none"
      stroke="#3b2b1a"
      stroke-width="1.5"
    />
    <path d="M30 9v22M19 20h22" stroke="#efe3c7" stroke-width="2" />
    <path
      d="M44 14l9-5M44 26l9 5M16 14l-9-5M16 26l-9 5"
      stroke=${color}
      stroke-width="3"
      stroke-linecap="round"
    />
  </svg>`;
}

/** A rising's colours: their field with a pine (the Liberty Tree) in a white canton. */
export function rebelFlag(color: string, cls = "cq-flag"): TemplateResult {
  return html`<svg class=${cls} viewBox="0 0 60 40" aria-hidden="true">
    <rect width="60" height="40" fill=${color} />
    <rect width="26" height="20" fill="#f6f1e3" />
    <path d="M13 3l6 8h-3l5 6H5l5-6H7z" fill="#2f5a2a" />
    <rect x="12" y="16" width="2" height="3" fill="#5a3a1a" />
    <path
      d="M0 26h60M0 33h60"
      stroke="#f6f1e3"
      stroke-width="2.5"
      opacity=".7"
    />
  </svg>`;
}

export function flagFor(
  n: {
    key: string;
    kind: string;
    color: string;
    religion?: string;
    flag?: NationFlag;
  },
  cls = "cq-flag",
): TemplateResult {
  // SOCIETY (r11): a flag its founders made.
  if (n.flag) return customFlag(n.flag, cls);
  if (n.kind === "native") return emblem(n.color, cls);
  if (n.kind === "rebels")
    return n.religion === "native"
      ? emblem(n.color, cls)
      : rebelFlag(n.color, cls);
  return flag(n.key.replace(/^crown-/, ""), cls);
}

/** SOCIETY (r11): a new nation's flag, as its founders made it. */
export function customFlag(f: NationFlag, cls = "cq-flag"): TemplateResult {
  const b = f.second;
  let div = svg``;
  switch (f.division) {
    case "pale":
      div = svg`<rect x="20" width="20" height="40" fill=${b} />`;
      break;
    case "fess":
      div = svg`<rect y="13.3" width="60" height="13.4" fill=${b} />`;
      break;
    case "bend":
      div = svg`<path d="M0 0h10l50 33v7H50L0 7z" fill=${b} />`;
      break;
    case "cross":
      div = svg`<rect x="17" width="8" height="40" fill=${b} /><rect y="16" width="60" height="8" fill=${b} />`;
      break;
    case "saltire":
      div = svg`<path d="M0 0 60 40M60 0 0 40" stroke=${b} stroke-width="7" />`;
      break;
    case "canton":
      div = svg`<rect width="27" height="20" fill=${b} />`;
      break;
    case "triband":
      div = svg`<rect x="20" width="20" height="40" fill=${b} /><rect width="60" height="40" fill="none" />`;
      break;
    case "stripes":
      div = svg`${[0, 1, 2, 3, 4, 5, 6, 7, 8]
        .filter((i) => i % 2 === 1)
        .map(
          (i) =>
            svg`<rect y=${(i * 40) / 9} width="60" height=${40 / 9} fill=${b} />`,
        )}`;
      break;
  }
  const inCanton = f.division === "canton";
  const [cx, cy, k] = inCanton ? [13.5, 10, 0.62] : [30, 20, 0.95];
  return html`<svg class=${cls} viewBox="0 0 60 40" aria-hidden="true">
    <rect width="60" height="40" fill=${f.field} />
    ${div}
    ${f.charge !== "none"
      ? svg`<g transform="translate(${cx} ${cy}) scale(${k})" fill=${f.chargeColor} stroke=${f.chargeColor} stroke-width="0.6" stroke-linejoin="round">${chargePath(f.charge)}</g>`
      : svg``}
    <rect
      width="60"
      height="40"
      fill="none"
      stroke="rgba(0,0,0,.25)"
      stroke-width="1"
    />
  </svg>`;
}
