// A painted-miniature portrait for every character, put together from parts
// the same way each time for the same person: face and skin, hair (greying
// with age), beard, collar or ruff, a hat now and then, and the set of the
// brows and mouth from their traits. Native leaders wear a mantle, beads and
// feathers instead of a European collar.

import { html, svg, SVGTemplateResult, TemplateResult } from "lit";
import type { Character } from "../engine/Types";

/** Small, steady pseudo-random numbers from a character's id. */
function dice(seed: number): () => number {
  let x = (seed * 2654435761) >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

const pick = <T>(r: () => number, list: readonly T[]): T =>
  list[Math.floor(r() * list.length)];

const EURO_SKIN = ["#f1c9a5", "#ebbd98", "#e2b28b", "#d8a57e"];
const IBERIAN_SKIN = ["#e0ad85", "#d39c74", "#c98f68"];
const NATIVE_SKIN = ["#b57d52", "#a46d45", "#93603c", "#b8835a"];
const HAIR = ["#1d1510", "#3a2618", "#5a3a22", "#7a5030", "#a06a3a", "#c89a5a"];
const NORDIC_HAIR = ["#5a3a22", "#8a6238", "#b88a50", "#d6b47a", "#e2c890"];
const CLOTH = [
  "#1d1a1a",
  "#2b2320",
  "#3b2a22",
  "#2a2f3a",
  "#3a2a3a",
  "#2f3a2a",
];

function grey(hair: string, age: number): string {
  if (age >= 62) return "#d9d4ca";
  if (age >= 52) return "#9a958c";
  if (age >= 45) return mixHex(hair, "#9a958c", 0.45);
  return hair;
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => [(pa >> s) & 255, (pb >> s) & 255];
  const out = [16, 8, 0].map((s) => {
    const [x, y] = ch(s);
    return Math.round(x + (y - x) * t);
  });
  return `#${((out[0] << 16) | (out[1] << 8) | out[2]).toString(16).padStart(6, "0")}`;
}

export interface PortraitOpts {
  age: number;
  /** The nation's colour, for the background. */
  color: string;
  native: boolean;
}

/** The portrait as an <svg>, sized by its class. */
export function portrait(
  c: Character | undefined,
  o: PortraitOpts,
  cls = "",
): TemplateResult {
  if (!c) return html`<span class="cq-portrait empty ${cls}"></span>`;
  const r = dice(c.id + 7);
  const iberian =
    c.culture === "spanish" ||
    c.culture === "portuguese" ||
    c.culture === "french";
  const nordic =
    c.culture === "swedish" || c.culture === "dutch" || c.culture === "english";
  const skin = pick(
    r,
    o.native ? NATIVE_SKIN : iberian ? IBERIAN_SKIN : EURO_SKIN,
  );
  const baseHair = o.native ? "#141010" : pick(r, nordic ? NORDIC_HAIR : HAIR);
  const hair = grey(baseHair, o.age);
  const child = o.age < 16;
  const t = (x: string) => c.traits.includes(x as Character["traits"][number]);
  const id = `pt${c.id}`;
  const bg = mixHex(o.color, "#2b1d12", 0.55);
  const faceRy = child ? 11 : 12.5;
  const faceY = child ? 37 : 34;

  // Brows and mouth from temperament.
  const browTilt =
    t("cruel") || t("ambitious")
      ? 2
      : t("content") || t("charming") || t("generous")
        ? -1
        : 0;
  const smile =
    t("charming") || t("generous") || t("content")
      ? 1.6
      : t("cruel") || t("greedy")
        ? -1.2
        : 0.2;
  const ink = "#2b1d12";

  const parts: SVGTemplateResult[] = [];
  // Background.
  parts.push(svg`<rect width="60" height="72" fill=${bg} />`);
  parts.push(
    svg`<ellipse cx="30" cy="26" rx="26" ry="24" fill="rgba(255,240,210,0.13)" />`,
  );

  // Shoulders and dress.
  if (o.native) {
    parts.push(
      svg`<path d="M4 72 C6 60 14 55 24 53 L36 53 C46 55 54 60 56 72 Z" fill=${skin} />`,
    );
    parts.push(
      svg`<path d="M4 72 C8 62 16 58 22 60 L30 66 L38 60 C44 58 52 62 56 72 Z" fill="#8a6440" stroke=${ink} stroke-width=".6" />`,
    );
    for (let i = 0; i < 7; i++) {
      const a = -0.9 + i * 0.3;
      parts.push(
        svg`<circle cx=${30 + Math.sin(a) * 9} cy=${55 + Math.cos(a) * 4} r="1.2" fill=${i % 2 ? "#e8e0c8" : "#7a1d14"} />`,
      );
    }
  } else if (c.female) {
    const dress = pick(r, CLOTH);
    parts.push(
      svg`<path d="M4 72 C6 61 14 56 23 54 L37 54 C46 56 54 61 56 72 Z" fill=${dress} />`,
    );
    parts.push(
      svg`<path d="M20 56 L30 66 L40 56 C36 58 24 58 20 56 Z" fill="#efe6d2" stroke=${ink} stroke-width=".4" />`,
    );
  } else {
    const coat = pick(r, CLOTH);
    parts.push(
      svg`<path d="M3 72 C5 60 13 55 23 53 L37 53 C47 55 55 60 57 72 Z" fill=${coat} />`,
    );
    if (!child)
      parts.push(
        svg`<path d="M24 54 L30 72 L36 54" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" />`,
      );
  }
  // Neck.
  parts.push(
    svg`<rect x="25.5" y=${faceY + 9} width="9" height="9" rx="3" fill=${skin} />`,
  );
  // Collar: a ruff for the Spanish and the old-fashioned, a falling band for the rest.
  if (!o.native && !child) {
    const ruff = (c.culture === "spanish" || o.age >= 55) && r() < 0.7;
    if (ruff) {
      const pts: SVGTemplateResult[] = [];
      for (let i = 0; i < 10; i++) {
        const a = Math.PI * (0.05 + (i * 0.9) / 9);
        pts.push(
          svg`<ellipse cx=${30 + Math.cos(a) * 11} cy=${faceY + 18 - Math.sin(a) * 2.2} rx="3.4" ry="2.6" fill="#f4eee0" stroke="#b9ad92" stroke-width=".5" />`,
        );
      }
      parts.push(...pts);
    } else if (!c.female) {
      parts.push(
        svg`<path d="M21 ${faceY + 17} L30 ${faceY + 23} L39 ${faceY + 17} L41 ${faceY + 25} L30 ${faceY + 28} L19 ${faceY + 25} Z" fill="#f4eee0" stroke="#b9ad92" stroke-width=".5" />`,
      );
    }
  }
  // Long hair behind the face.
  const longHair = o.native || c.female || (!child && r() < 0.45);
  if (longHair) {
    const len = o.native ? 22 : c.female ? 14 : 10;
    parts.push(
      svg`<path d="M17 ${faceY - 6} C15 ${faceY + 4} 16 ${faceY + len} 19 ${faceY + len + 2} L41 ${faceY + len + 2} C44 ${faceY + len} 45 ${faceY + 4} 43 ${faceY - 6} Z" fill=${hair} />`,
    );
  }
  // Ears and face.
  parts.push(
    svg`<ellipse cx="19.6" cy=${faceY + 1} rx="2" ry="3" fill=${skin} stroke=${ink} stroke-width=".5" />`,
  );
  parts.push(
    svg`<ellipse cx="40.4" cy=${faceY + 1} rx="2" ry="3" fill=${skin} stroke=${ink} stroke-width=".5" />`,
  );
  parts.push(
    svg`<ellipse cx="30" cy=${faceY} rx="10.4" ry=${faceRy} fill=${skin} stroke=${ink} stroke-width=".7" />`,
  );
  // Cheek warmth.
  parts.push(
    svg`<ellipse cx="24.5" cy=${faceY + 4} rx="2.6" ry="1.6" fill="rgba(200,90,70,0.16)" />`,
  );
  parts.push(
    svg`<ellipse cx="35.5" cy=${faceY + 4} rx="2.6" ry="1.6" fill="rgba(200,90,70,0.16)" />`,
  );
  // Hair on top.
  const bald = !c.female && !o.native && o.age >= 50 && r() < 0.35;
  if (o.native && !c.female && r() < 0.5) {
    // A roach: shaved sides, a crest of hair.
    parts.push(
      svg`<path d="M26 ${faceY - 12} C27 ${faceY - 17} 33 ${faceY - 17} 34 ${faceY - 12} L32 ${faceY - 9} L28 ${faceY - 9} Z" fill=${hair} />`,
    );
  } else if (!bald) {
    parts.push(
      svg`<path d="M19.4 ${faceY - 1} C18 ${faceY - 14} 42 ${faceY - 14} 40.6 ${faceY - 1} C39 ${faceY - 8} 33 ${faceY - 10} 30 ${faceY - 9} C26 ${faceY - 10} 21 ${faceY - 8} 19.4 ${faceY - 1} Z" fill=${hair} />`,
    );
  } else {
    parts.push(
      svg`<path d="M19.4 ${faceY} C19 ${faceY - 5} 21 ${faceY - 6} 22 ${faceY - 6} L22 ${faceY + 2} Z M40.6 ${faceY} C41 ${faceY - 5} 39 ${faceY - 6} 38 ${faceY - 6} L38 ${faceY + 2} Z" fill=${hair} />`,
    );
  }
  if (c.female && !o.native && r() < 0.6)
    parts.push(
      svg`<path d="M18.5 ${faceY - 2} C18 ${faceY - 16} 42 ${faceY - 16} 41.5 ${faceY - 2} C38 ${faceY - 10} 22 ${faceY - 10} 18.5 ${faceY - 2} Z" fill="#f4eee0" stroke="#b9ad92" stroke-width=".5" />`,
    );
  // Brows, eyes, nose, mouth.
  parts.push(
    svg`<path d="M23 ${faceY - 4 - browTilt * 0.3} L27.5 ${faceY - 4 + browTilt * 0.5} M37 ${faceY - 4 - browTilt * 0.3} L32.5 ${faceY - 4 + browTilt * 0.5}" stroke=${grey(baseHair, o.age)} stroke-width="1.3" stroke-linecap="round" />`,
  );
  parts.push(
    svg`<ellipse cx="25.4" cy=${faceY - 1} rx="1.3" ry="1" fill=${ink} />`,
  );
  parts.push(
    svg`<ellipse cx="34.6" cy=${faceY - 1} rx="1.3" ry="1" fill=${ink} />`,
  );
  parts.push(
    svg`<path d="M30 ${faceY - 1} L29 ${faceY + 4.5} L31 ${faceY + 5}" fill="none" stroke="rgba(43,29,18,0.6)" stroke-width=".8" stroke-linecap="round" />`,
  );
  parts.push(
    svg`<path d="M26.5 ${faceY + 8} Q30 ${faceY + 8 + smile} 33.5 ${faceY + 8}" fill="none" stroke="#7a3a2a" stroke-width="1.1" stroke-linecap="round" />`,
  );
  // Lines of age.
  if (o.age >= 45) {
    parts.push(
      svg`<path d="M24 ${faceY - 7} Q30 ${faceY - 8} 36 ${faceY - 7} M21.5 ${faceY + 1} l1.5 .8 M38.5 ${faceY + 1} l-1.5 .8" fill="none" stroke="rgba(43,29,18,0.35)" stroke-width=".6" />`,
    );
  }
  if (t("sickly"))
    parts.push(
      svg`<ellipse cx="30" cy=${faceY} rx="10.4" ry=${faceRy} fill="rgba(170,190,150,0.22)" />`,
    );
  // Beards.
  if (!c.female && !o.native && !child && o.age >= 18) {
    const beard = pick(r, [
      "none",
      "moustache",
      "vandyke",
      "vandyke",
      "full",
    ] as const);
    const bc = grey(baseHair, o.age);
    if (beard !== "none")
      parts.push(
        svg`<path d="M25.5 ${faceY + 7} Q30 ${faceY + 5} 34.5 ${faceY + 7} Q32 ${faceY + 6.6} 30 ${faceY + 7.4} Q28 ${faceY + 6.6} 25.5 ${faceY + 7} Z" fill=${bc} />`,
      );
    if (beard === "vandyke")
      parts.push(
        svg`<path d="M28 ${faceY + 9.5} L30 ${faceY + 15} L32 ${faceY + 9.5} Z" fill=${bc} />`,
      );
    if (beard === "full")
      parts.push(
        svg`<path d="M20 ${faceY + 2} C21 ${faceY + 14} 39 ${faceY + 14} 40 ${faceY + 2} C38 ${faceY + 9} 33 ${faceY + 11} 30 ${faceY + 11} C27 ${faceY + 11} 22 ${faceY + 9} 20 ${faceY + 2} Z" fill=${bc} />`,
      );
  }
  // Feathers, or now and then a hat.
  if (o.native) {
    parts.push(
      svg`<path d="M36 ${faceY - 10} C40 ${faceY - 22} 44 ${faceY - 24} 43 ${faceY - 26} C41 ${faceY - 20} 38 ${faceY - 14} 37 ${faceY - 9} Z" fill="#efe6d2" stroke=${ink} stroke-width=".5" />`,
    );
    if (r() < 0.5)
      parts.push(
        svg`<path d="M24 ${faceY - 10} C21 ${faceY - 20} 18 ${faceY - 22} 18 ${faceY - 24} C21 ${faceY - 19} 23 ${faceY - 15} 25.5 ${faceY - 9.5} Z" fill="#7a1d14" stroke=${ink} stroke-width=".5" />`,
      );
  } else if (!c.female && !child && r() < 0.3) {
    const capotain = nordic && r() < 0.6;
    if (capotain)
      parts.push(
        svg`<path d="M14 ${faceY - 8} L46 ${faceY - 8} L44 ${faceY - 10} L39 ${faceY - 10} L37 ${faceY - 24} L23 ${faceY - 24} L21 ${faceY - 10} L16 ${faceY - 10} Z" fill="#1d1a1a" /><rect x="21.8" y=${faceY - 13} width="16.4" height="2.4" fill="#5a4a3a" />`,
      );
    else
      parts.push(
        svg`<ellipse cx="30" cy=${faceY - 9} rx="17" ry="4" fill="#1d1a1a" /><path d="M22 ${faceY - 10} C22 ${faceY - 19} 38 ${faceY - 19} 38 ${faceY - 10} Z" fill="#1d1a1a" /><path d="M36 ${faceY - 15} C44 ${faceY - 22} 50 ${faceY - 16} 47 ${faceY - 10}" fill="none" stroke=${o.color} stroke-width="2.4" stroke-linecap="round" />`,
      );
  }

  return html`<svg
    class="cq-portrait ${c.alive ? "" : "dead"} ${cls}"
    viewBox="0 0 60 72"
    role="img"
    aria-label=${`Portrait of ${c.first}`}
  >
    <defs>
      <clipPath id=${id}>
        <ellipse cx="30" cy="36" rx="28" ry="34.5" />
      </clipPath>
    </defs>
    <g clip-path=${`url(#${id})`}>${parts}</g>
    <ellipse
      cx="30"
      cy="36"
      rx="28"
      ry="34.5"
      fill="none"
      stroke="#b08a3e"
      stroke-width="2.2"
    />
    <ellipse
      cx="30"
      cy="36"
      rx="29.4"
      ry="35.6"
      fill="none"
      stroke="#5a4020"
      stroke-width=".8"
    />
  </svg>`;
}
