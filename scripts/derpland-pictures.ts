// PROFILE (r26): draws Derp Land's preset profile pictures, one SVG each in
// resources/public/derpland/pics/ (src/derpland/Pictures.ts lists them).
// Original drawings in the site's look: flat colours inside the banana's
// dark brown outline, a soft lit background, and eyes that don't quite
// agree with each other. Run it after changing one:
//
//   npx tsx scripts/derpland-pictures.ts [--sheet <file.html>]
//
// Each picture is drawn on 64×64 and shown in a circle, so what matters
// stays inside the middle.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PRESETS } from "../src/derpland/Pictures";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "resources", "public", "derpland", "pics");

/** The outline: the banana's own dark brown. */
const O = "#2e2010";
const SKIN = ["#f2c9a0", "#d9a273", "#a8714a", "#7a4b2e"];
const GOLD = "#e7b84a";
const GOLD_L = "#ffe08a";
const GOLD_D = "#9a6a12";

const BG: Record<string, [string, string]> = {
  sky: ["#a9d4f0", "#4f8fc4"],
  sea: ["#6fb0e0", "#245a92"],
  grass: ["#a8dfae", "#3f9a5e"],
  dusk: ["#c7a8ec", "#5e3d9a"],
  sand: ["#f7e2b0", "#d49a4c"],
  teal: ["#8fdcd6", "#257f7b"],
  red: ["#f6a08a", "#b83a28"],
  night: ["#4a5c92", "#151c36"],
  slate: ["#b5bdcc", "#4f5869"],
  forest: ["#8cc9a0", "#1f5a3c"],
  peach: ["#ffd2b0", "#e0784a"],
  dark: ["#43434f", "#17171c"],
};

const s = (w = 2) =>
  `stroke="${O}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

function wrap(id: string, bg: keyof typeof BG, body: string): string {
  const [a, b] = BG[bg];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
<defs><radialGradient id="bg-${id}" cx="34%" cy="26%" r="85%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs>
<rect width="64" height="64" fill="url(#bg-${id})"/>
${body.trim()}
</svg>
`;
}

/** Two eyes that don't quite agree: the left a little smaller, looking up. */
function eyes(lx: number, ly: number, rx: number, ry: number, k = 1): string {
  return `<circle cx="${lx}" cy="${ly}" r="${2.4 * k}" fill="#fff" ${s(1.3)}/>
<circle cx="${lx + 0.5 * k}" cy="${ly - 0.4 * k}" r="${1.15 * k}" fill="${O}"/>
<circle cx="${rx}" cy="${ry}" r="${3 * k}" fill="#fff" ${s(1.3)}/>
<circle cx="${rx - 0.6 * k}" cy="${ry + 0.5 * k}" r="${1.35 * k}" fill="${O}"/>`;
}

/** A head and shoulders: everything a portrait shares. */
function person(o: {
  skin: string;
  coat: string;
  under?: string;
  over?: string;
  hair?: string;
  mouth?: string;
  cheeks?: boolean;
}): string {
  return `${o.under ?? ""}
<path d="M6 68 C8 53 19 47.5 32 47.5 S56 53 58 68 Z" fill="${o.coat}" ${s()}/>
${o.hair ?? ""}
<circle cx="19.6" cy="34" r="2.8" fill="${o.skin}" ${s(1.6)}/>
<circle cx="44.4" cy="34" r="2.8" fill="${o.skin}" ${s(1.6)}/>
<circle cx="32" cy="33" r="13" fill="${o.skin}" ${s()}/>
${o.cheeks === false ? "" : `<ellipse cx="25" cy="38.5" rx="2.4" ry="1.4" fill="#e8553f" opacity=".35"/><ellipse cx="39.5" cy="38.5" rx="2.4" ry="1.4" fill="#e8553f" opacity=".35"/>`}
${eyes(27, 33.4, 37, 32.6)}
<path d="M31.4 35.6 q1.4 1.6 0 2.6" fill="none" ${s(1.3)}/>
${o.mouth ?? `<path d="M28.4 40.6 Q32 43.6 35.6 40.4" fill="none" ${s(1.6)}/>`}
${o.over ?? ""}`;
}

/** A gold ring round an emblem. */
const ring = `<circle cx="32" cy="32" r="28.5" fill="none" stroke="${GOLD}" stroke-width="2.6"/>
<circle cx="32" cy="32" r="25.6" fill="none" stroke="${GOLD_D}" stroke-width="1" opacity=".8"/>`;

const DRAW: Record<string, () => string> = {
  // ---------------------------------------------------------------- portraits
  settler: () =>
    wrap(
      "settler",
      "sky",
      person({
        skin: SKIN[0],
        coat: "#8a5a34",
        hair: `<path d="M19 30 Q18 40 21 44 L24 40 Z M45 30 Q46 40 43 44 L40 40 Z" fill="#6b3f22" ${s(1.4)}/>`,
        over: `<path d="M28.5 47.5 L32 55 L35.5 47.5 Z" fill="#f4f4f5" ${s(1.4)}/>
<path d="M21 25 Q22 13.5 32 13 Q42 13.5 43 25 Z" fill="#3a2a1e" ${s()}/>
<path d="M12 27 Q22 17 32 23 Q42 17 52 27 Q42 30.5 32 28.5 Q22 30.5 12 27 Z" fill="#2b2018" ${s()}/>
<path d="M14.5 26.6 Q22 19.6 32 24.6 Q42 19.6 49.5 26.6" fill="none" stroke="${GOLD}" stroke-width="1.2"/>`,
      }),
    ),
  admiral: () =>
    wrap(
      "admiral",
      "sea",
      person({
        skin: SKIN[1],
        coat: "#24345e",
        hair: `<path d="M18.5 28 Q17 36 19 41 Q21 37 22 32 Z M45.5 28 Q47 36 45 41 Q43 37 42 32 Z" fill="#eceae4" ${s(1.4)}/>`,
        over: `<ellipse cx="13" cy="54" rx="6.5" ry="3" fill="${GOLD}" ${s(1.4)} transform="rotate(-18 13 54)"/>
<ellipse cx="51" cy="54" rx="6.5" ry="3" fill="${GOLD}" ${s(1.4)} transform="rotate(18 51 54)"/>
<path d="M30 48 L32 64 L34 48" fill="none" stroke="${GOLD}" stroke-width="1.4"/>
<path d="M7 25 Q32 1 57 25 Q32 17.5 7 25 Z" fill="#1f2a44" ${s()}/>
<path d="M9.5 23.6 Q32 3.6 54.5 23.6" fill="none" stroke="${GOLD}" stroke-width="1.6"/>
<circle cx="32" cy="15" r="3.2" fill="#f4f4f5" ${s(1.3)}/><circle cx="32" cy="15" r="1.4" fill="#d9573f"/>`,
      }),
    ),
  grenadier: () =>
    wrap(
      "grenadier",
      "slate",
      person({
        skin: SKIN[0],
        coat: "#c2412e",
        mouth: `<path d="M26 39.4 Q29 37 32 38.6 Q35 37 38 39.4 Q35 41.4 32 40.2 Q29 41.4 26 39.4 Z" fill="#4a2c18" ${s(1.2)}/>`,
        over: `<path d="M14 52 L44 64 M50 52 L20 64" stroke="#f4f4f5" stroke-width="3.4"/>
<path d="M14 52 L44 64 M50 52 L20 64" stroke="${O}" stroke-width=".8" opacity=".5"/>
<path d="M20 25.5 L23 5 Q32 0 41 5 L44 25.5 Z" fill="#c2412e" ${s()}/>
<path d="M23.4 24.5 L25.6 9 Q32 5.6 38.4 9 L40.6 24.5 Z" fill="${GOLD}" ${s(1.4)}/>
<path d="M32 12 l2 4.2 4.4.4-3.3 3 1 4.4-4.1-2.3-4.1 2.3 1-4.4-3.3-3 4.4-.4z" fill="${GOLD_D}"/>
<rect x="19" y="23.5" width="26" height="4" rx="1.6" fill="#f4f4f5" ${s(1.4)}/>`,
      }),
    ),
  farmer: () =>
    wrap(
      "farmer",
      "grass",
      person({
        skin: SKIN[2],
        coat: "#3b7fc4",
        under: "",
        over: `<path d="M20 48.6 L22 64 M44 48.6 L42 64" stroke="#2a5c92" stroke-width="3"/>
<circle cx="22.4" cy="55" r="1.4" fill="${GOLD}"/><circle cx="41.6" cy="55" r="1.4" fill="${GOLD}"/>
<path d="M27 49 Q32 52 37 49 L37 47.6 L27 47.6 Z" fill="#e8553f" ${s(1.2)}/>
<path d="M35 41 L49 33" stroke="#c99a3a" stroke-width="1.4"/>
<path d="M47 33.8 q2.4-2.6 4.6-1.2 q-1.6 2.6-4.6 1.2 Z M45.6 32.4 q.6-3 3.2-3.2 q-.2 2.8-3.2 3.2 Z M48.2 35.4 q3.2-.6 3.8 1.6 q-2.6 1.2-3.8-1.6 Z" fill="#e9c46a" ${s(0.9)}/>
<ellipse cx="32" cy="24.6" rx="23" ry="5.6" fill="#e9c46a" ${s()}/>
<path d="M22 24.2 Q22 11.5 32 11.5 Q42 11.5 42 24.2 Q32 27 22 24.2 Z" fill="#f0d27e" ${s()}/>
<path d="M22.4 21 Q32 23.8 41.6 21 L41.8 24 Q32 26.8 22.2 24 Z" fill="#c94f86"/>`,
      }),
    ),
  pirate: () =>
    wrap(
      "pirate",
      "teal",
      person({
        skin: SKIN[1],
        coat: "#f4f4f5",
        mouth: `<path d="M28 40.4 Q32 43.4 36.4 39.6" fill="none" ${s(1.6)}/><path d="M33.4 41.6 l.8 1.6 .9-1.8" fill="#fff" ${s(0.9)}/>`,
        over: `<path d="M12 56 Q32 50 52 56 M9 62 Q32 56 55 62" fill="none" stroke="#24345e" stroke-width="3"/>
<circle cx="19.4" cy="38.6" r="2.1" fill="none" stroke="${GOLD}" stroke-width="1.5"/>
<path d="M18.6 30.6 L45.6 28" stroke="${O}" stroke-width="1.3"/>
<ellipse cx="37.2" cy="32.8" rx="4" ry="3.6" fill="#17171c" ${s(1.2)}/>
<path d="M18.4 30 Q18 16.6 32 16.6 Q46 16.6 45.6 29 Q32 23.2 18.4 30 Z" fill="#d9573f" ${s()}/>
<circle cx="26" cy="21.6" r="1.1" fill="#fff"/><circle cx="33" cy="20" r="1.1" fill="#fff"/><circle cx="39.6" cy="22.4" r="1.1" fill="#fff"/>
<path d="M45 25.6 L52 21.4 L50.4 28.2 Z M45.4 27.2 L52.6 30.6 L46.2 31.6 Z" fill="#d9573f" ${s(1.4)}/>`,
      }),
    ),
  queen: () =>
    wrap(
      "queen",
      "dusk",
      person({
        skin: SKIN[0],
        coat: "#8a5cc4",
        hair: `<g fill="#7a4520" ${s(1.6)}><circle cx="18.6" cy="27" r="6"/><circle cx="16.6" cy="36" r="6"/><circle cx="18.6" cy="44.4" r="5.4"/><circle cx="45.4" cy="27" r="6"/><circle cx="47.4" cy="36" r="6"/><circle cx="45.4" cy="44.4" r="5.4"/><circle cx="32" cy="21" r="10"/></g>`,
        mouth: `<path d="M29.4 40.4 Q32 42.6 34.6 40.4 Q32 39.6 29.4 40.4 Z" fill="#c2412e" ${s(1.1)}/>`,
        over: `<path d="M16 51 q3 3 6 0 q3 3 6 0 q2 3 4 3 q2 0 4-3 q3 3 6 0 q3 3 6 0 L48 49 Q32 44 16 49 Z" fill="#f4f4f5" ${s(1.3)}/>
<path d="M21 22.5 L22.6 9.6 L27.4 15.4 L32 7.4 L36.6 15.4 L41.4 9.6 L43 22.5 Q32 20 21 22.5 Z" fill="${GOLD}" ${s(1.6)}/>
<circle cx="32" cy="16.4" r="1.9" fill="#d9573f"/><circle cx="25.6" cy="18.6" r="1.4" fill="#3b7fc4"/><circle cx="38.4" cy="18.6" r="1.4" fill="#3b7fc4"/>
<circle cx="22.6" cy="9.6" r="1.4" fill="${GOLD_L}" ${s(1)}/><circle cx="32" cy="7.4" r="1.4" fill="${GOLD_L}" ${s(1)}/><circle cx="41.4" cy="9.6" r="1.4" fill="${GOLD_L}" ${s(1)}/>`,
      }),
    ),
  scholar: () =>
    wrap(
      "scholar",
      "sand",
      person({
        skin: SKIN[0],
        coat: "#2f6d4f",
        hair: `<g fill="#f1efe8" ${s(1.5)}><circle cx="19" cy="25" r="5.4"/><circle cx="17.6" cy="33.6" r="5.4"/><circle cx="18.6" cy="42" r="5"/><circle cx="45" cy="25" r="5.4"/><circle cx="46.4" cy="33.6" r="5.4"/><circle cx="45.4" cy="42" r="5"/><path d="M19 27 Q19 14 32 14 Q45 14 45 27 Q38 21 32 22 Q26 21 19 27 Z"/></g>`,
        over: `<path d="M28 47.8 Q32 53 36 47.8" fill="#f4f4f5" ${s(1.3)}/>
<circle cx="27" cy="33.4" r="4.4" fill="none" stroke="${GOLD_D}" stroke-width="1.6"/>
<circle cx="37" cy="32.6" r="4.6" fill="none" stroke="${GOLD_D}" stroke-width="1.6"/>
<path d="M31.4 33 Q32 32 32.4 32.8" fill="none" stroke="${GOLD_D}" stroke-width="1.4"/>`,
      }),
    ),
  knight: () =>
    wrap(
      "knight",
      "red",
      `<path d="M6 68 C8 53 19 47.5 32 47.5 S56 53 58 68 Z" fill="#9aa3b5" ${s()}/>
<path d="M10 58 Q32 50 54 58" fill="none" stroke="#6b7484" stroke-width="1.6"/>
<circle cx="15" cy="57" r="1.2" fill="${O}"/><circle cx="49" cy="57" r="1.2" fill="${O}"/>
<path d="M36 13 Q46 2 52 8 Q46 7 41 14 Z" fill="#d9573f" ${s(1.6)}/>
<path d="M17.5 42 Q16 17 32 16 Q48 17 46.5 42 Q32 49 17.5 42 Z" fill="#c4ccd8" ${s()}/>
<path d="M32 16.4 L32 30" stroke="#8a93a4" stroke-width="2"/>
<rect x="19.6" y="29" width="24.8" height="7" rx="3.2" fill="#17171c" ${s(1.4)}/>
<circle cx="27" cy="32.5" r="1.8" fill="#fff"/><circle cx="37.6" cy="32.2" r="2.3" fill="#fff"/>
<circle cx="27.4" cy="32.3" r=".8" fill="${O}"/><circle cx="37.2" cy="32.6" r="1" fill="${O}"/>
<g fill="${O}"><circle cx="27" cy="40" r=".9"/><circle cx="30" cy="41" r=".9"/><circle cx="34" cy="41" r=".9"/><circle cx="37" cy="40" r=".9"/></g>`,
    ),
  banana: () =>
    wrap(
      "banana",
      "sky",
      `<g transform="translate(-2 1)">
<path d="M45.5 13.5 47.6 5.2Q48 3.8 49.4 4.2l3.2 1q1.3.5.8 1.8l-3 8.6z" fill="#6b4a1f" ${s(1.6)}/>
<path d="M46.4 12.6c8.2 5.8 10 21 2.2 32.6-7.2 10.6-22.2 15-35.8 11.2-3.2-.9-4.2-3.8-2.2-5.2 14-.4 25.2-7.2 30.4-17.6 3.2-6.4 3.4-13.4 2-18.4-.4-2 1.6-3.6 3.4-2.6z" fill="#f5cc3c" ${s()}/>
<path d="M50.6 21.4c2.6 10.4 0 20.2-7 27.6-6.6 6.6-17.2 9.8-27.8 8.4 11.6-1 22.8-6 29-14.8 4.6-6.6 6.4-14 5.8-21.2z" fill="#e2a81c"/>
<path d="M10.6 51.2c-1.6 1-1.6 3.4.4 4.4l2.4.9c-1.4-1.7-1.8-3.7-.8-5.3z" fill="#4a3216"/>
${eyes(41.6, 25, 48.2, 29.6, 1.2)}
<path d="M38.6 36.4 Q42 40.6 46.8 37.4" fill="none" ${s(1.7)}/>
<ellipse cx="38.4" cy="32.4" rx="2" ry="1.2" fill="#e8553f" opacity=".4"/>
</g>`,
    ),
  // ---------------------------------------------------------------- animals
  gator: () =>
    wrap(
      "gator",
      "teal",
      `<path d="M4 50 Q8 37 22 34 L50 34.5 Q60 35 59 41 Q58 45.6 52 46 L24 47 Q10 50 4 50 Z" fill="#4c9a52" ${s()}/>
<path d="M24 47 L52 46 Q57 45.8 58.4 42.6 Q52 49 24 51.6 Q12 52.6 6 52 Q8 49.6 24 47 Z" fill="#a8d08d" ${s(1.4)}/>
<path d="M26 41 L56.6 40.4" fill="none" ${s(1.4)}/>
<path d="M29 41 l1.6 2.6 1.6-2.6 1.6 2.6 1.6-2.6 1.6 2.6 1.6-2.6 1.6 2.6 1.6-2.6 1.6 2.6 1.6-2.6 1.6 2.6 1.6-2.6" fill="#fff" ${s(1)}/>
<ellipse cx="54.6" cy="36" rx="1.4" ry=".9" fill="${O}"/>
<path d="M14 36 Q16 26 24 26 Q32 26 33 34 Z" fill="#4c9a52" ${s()}/>
${eyes(20.6, 30.2, 27.4, 29.8, 1.05)}
<g fill="#3a7a40"><circle cx="38" cy="37.6" r="1.1"/><circle cx="42.6" cy="37.2" r="1.1"/><circle cx="47" cy="37.4" r="1.1"/></g>`,
    ),
  eagle: () =>
    wrap(
      "eagle",
      "sky",
      `<path d="M8 68 C10 54 20 46 34 46 S56 52 58 68 Z" fill="#6b3f22" ${s()}/>
<path d="M22 47 Q34 54 46 47" fill="none" stroke="#8a5a34" stroke-width="2"/>
<path d="M21 34 Q20 18 35 17 Q50 17 49 33 Q48 44 40 49 L28 49 Q22 44 21 34 Z" fill="#f7f5ef" ${s()}/>
<path d="M21.6 33 Q12 31 10.6 39.4 Q11.4 43 14.6 42 Q16.4 37.6 22.6 38.6 Z" fill="#f2b632" ${s(1.6)}/>
<path d="M14.4 41.6 Q13 44.6 15.6 45" fill="none" ${s(1.3)}/>
<path d="M26.6 27.4 L34.6 29.4" ${s(1.8)}/>
${eyes(30, 31.4, 38.2, 30, 0.95)}
<path d="M38 40.6 Q41.6 39.6 43 42" fill="none" stroke="#c8c2b0" stroke-width="1.4"/>`,
    ),
  bear: () =>
    wrap(
      "bear",
      "grass",
      `<circle cx="18" cy="20" r="6.6" fill="#8a5a34" ${s()}/><circle cx="18" cy="20" r="3.4" fill="#c98e62"/>
<circle cx="46" cy="20" r="6.6" fill="#8a5a34" ${s()}/><circle cx="46" cy="20" r="3.4" fill="#c98e62"/>
<path d="M8 68 C10 54 20 50 32 50 S54 54 56 68 Z" fill="#7a4b2e" ${s()}/>
<circle cx="32" cy="34" r="17" fill="#8a5a34" ${s()}/>
<ellipse cx="32" cy="41" rx="8" ry="6.4" fill="#e3c39a" ${s(1.6)}/>
<ellipse cx="32" cy="37.8" rx="3" ry="2.1" fill="${O}"/>
<path d="M32 40 L32 42.6 M28.6 43.6 Q32 46 35.4 43.6" fill="none" ${s(1.5)}/>
${eyes(25.6, 30.6, 38.4, 29.8, 1.05)}`,
    ),
  fox: () =>
    wrap(
      "fox",
      "forest",
      `<path d="M14 30 L12 8 L27 20 Z" fill="#e57a2e" ${s()}/><path d="M15.4 24 L14.4 12.6 L22.4 19.4 Z" fill="#2e2010" opacity=".75"/>
<path d="M50 30 L52 8 L37 20 Z" fill="#e57a2e" ${s()}/><path d="M48.6 24 L49.6 12.6 L41.6 19.4 Z" fill="#2e2010" opacity=".75"/>
<path d="M10 70 C12 56 22 52 32 52 S52 56 54 70 Z" fill="#d06628" ${s()}/>
<path d="M24 52.4 Q32 62 40 52.4 Q32 50.6 24 52.4 Z" fill="#fff6e8" ${s(1.4)}/>
<path d="M11 30 Q14 18 32 18 Q50 18 53 30 Q52 40 32 54 Q12 40 11 30 Z" fill="#e57a2e" ${s()}/>
<path d="M12.2 33 Q18 36 24 38.4 Q28 46 32 53.4 Q20 44 12.2 33 Z M51.8 33 Q46 36 40 38.4 Q36 46 32 53.4 Q44 44 51.8 33 Z" fill="#fff6e8"/>
<path d="M11 30 Q14 18 32 18 Q50 18 53 30 Q52 40 32 54 Q12 40 11 30 Z" fill="none" ${s()}/>
<ellipse cx="32" cy="48.6" rx="2.8" ry="2" fill="${O}"/>
${eyes(25.4, 32, 38.6, 31.4, 1.05)}`,
    ),
  owl: () =>
    wrap(
      "owl",
      "night",
      `<circle cx="50" cy="13" r="5" fill="#fff4d2" opacity=".9"/><circle cx="52.4" cy="11.6" r="4.4" fill="#2a3560"/>
<path d="M17 20 L14.6 9.6 L25 16 Z M47 20 L49.4 9.6 L39 16 Z" fill="#8a5a34" ${s(1.8)}/>
<path d="M13 40 Q12 15 32 15 Q52 15 51 40 Q50 60 32 62 Q14 60 13 40 Z" fill="#8a5a34" ${s()}/>
<path d="M22 50 l2.6 2.6 2.6-2.6 M29.4 52 l2.6 2.6 2.6-2.6 M37 50 l2.6 2.6 2.6-2.6 M25.6 56 l2.6 2.4 2.6-2.4 M33.4 56 l2.6 2.4 2.6-2.4" fill="none" stroke="#e3c39a" stroke-width="1.4"/>
<circle cx="24.4" cy="31" r="8.4" fill="#e3c39a" ${s(1.6)}/><circle cx="39.6" cy="31" r="8.4" fill="#e3c39a" ${s(1.6)}/>
<circle cx="24.4" cy="31" r="5.2" fill="#fff" ${s(1.3)}/><circle cx="25.2" cy="30.2" r="2.6" fill="${O}"/>
<circle cx="39.6" cy="31" r="6.2" fill="#fff" ${s(1.3)}/><circle cx="38.6" cy="32" r="3" fill="${O}"/>
<circle cx="26" cy="29.4" r=".9" fill="#fff"/><circle cx="39.6" cy="31" r="1" fill="#fff"/>
<path d="M29.6 37.6 L32 43 L34.4 37.6 Z" fill="${GOLD}" ${s(1.4)}/>`,
    ),
  horse: () =>
    wrap(
      "horse",
      "sand",
      `<path d="M38 12 L43 3 L46 14 Z" fill="#b07a4a" ${s(1.8)}/>
<path d="M44 14 Q52 22 54 36 Q56 52 58 68 L30 68 Q34 58 34 52 L24 50 Q14 51 12.4 45 Q11 40 15 36 L28 18 Q34 11 44 14 Z" fill="#b07a4a" ${s()}/>
<path d="M44 13.6 Q38 18 40 24 Q46 28 44 34 Q52 38 50 46 Q56 52 54 60 Q60 54 58 40 Q56 24 44 13.6 Z" fill="#4a2c18" ${s(1.6)}/>
<path d="M12.6 45 Q11 40 15 36 Q20 37 22 42 Q22 49 15.6 49.4 Q13.2 48.4 12.6 45 Z" fill="#d9a273" ${s(1.6)}/>
<ellipse cx="15.6" cy="41.6" rx="1.4" ry="1.9" fill="${O}" transform="rotate(-20 15.6 41.6)"/>
${eyes(28.6, 25.4, 34.6, 26.6, 0.95)}
<path d="M15.4 46.6 Q18 48 20 46.4" fill="none" ${s(1.3)}/>`,
    ),
  beaver: () =>
    wrap(
      "beaver",
      "sea",
      `<path d="M6 60 Q20 54 32 58 Q44 62 58 56 L58 64 L6 64 Z" fill="#7fc3e8" opacity=".6"/>
<circle cx="18.6" cy="20.6" r="4.6" fill="#7a4b2e" ${s()}/><circle cx="45.4" cy="20.6" r="4.6" fill="#7a4b2e" ${s()}/>
<path d="M10 68 C12 55 21 50 32 50 S52 55 54 68 Z" fill="#7a4b2e" ${s()}/>
<path d="M15 35 Q15 17 32 17 Q49 17 49 35 Q49 50 32 51 Q15 50 15 35 Z" fill="#8a5a34" ${s()}/>
<ellipse cx="32" cy="40" rx="9.4" ry="7" fill="#d9b48a" ${s(1.6)}/>
<ellipse cx="32" cy="35.6" rx="3.4" ry="2.4" fill="${O}"/>
<path d="M28.4 42.6 Q32 44.6 35.6 42.6" fill="none" ${s(1.4)}/>
<rect x="28.8" y="43" width="6.4" height="6.6" rx="1" fill="#fff" ${s(1.4)}/><path d="M32 43 L32 49.6" ${s(1)}/>
${eyes(25.4, 29.8, 38.4, 29.2, 1.0)}`,
    ),
  turtle: () =>
    wrap(
      "turtle",
      "peach",
      `<path d="M4 56 Q32 50 60 56 L60 64 L4 64 Z" fill="#f7e2b0" opacity=".7"/>
<g transform="translate(-3.5 -1)">
<ellipse cx="18" cy="51" rx="4" ry="3" fill="#8fd19e" ${s(1.6)}/><ellipse cx="38" cy="51.6" rx="4" ry="3" fill="#8fd19e" ${s(1.6)}/>
<path d="M45 42 Q50 28 54 27 Q62 27 61 35 Q60 42 51 44 Z" fill="#8fd19e" ${s()}/>
${eyes(53.2, 31.6, 57.4, 33, 0.8)}
<path d="M53.6 38.2 Q56 39.6 58.4 38.4" fill="none" ${s(1.2)}/>
<path d="M6 46 Q8 22 28 21 Q48 22 50 46 Z" fill="#3a9d63" ${s()}/>
<path d="M6 46 L50 46" ${s(1.8)}/>
<path d="M20 26 L28 32 L36 26 M28 32 L28 45.6 M13 34 L20 39 L28 32 L36 39 L43 34 M20 39 L18 45.6 M36 39 L38 45.6" fill="none" stroke="#2a7a4a" stroke-width="1.6"/>
<path d="M4 48 Q28 52 52 48 L50 46 L6 46 Z" fill="#e3c39a" ${s(1.4)}/>
</g>`,
    ),
  // ---------------------------------------------------------------- game pieces
  musket: () =>
    wrap(
      "musket",
      "red",
      [-38, 38]
        .map(
          (a) => `<g transform="translate(32 33) rotate(${a})">
<rect x="-1.5" y="-29" width="3" height="36" rx="1" fill="#9aa3b5" ${s(1.4)}/>
<path d="M-1 -29 L0 -35 L1 -29 Z" fill="#e6eaf0" ${s(1)}/>
<rect x="-2.6" y="-6" width="5.2" height="3" fill="${GOLD}" ${s(1)}/>
<path d="M-2.6 5 L2.6 5 L4.6 25 Q0 28 -4.6 25 Z" fill="#8a5a34" ${s(1.6)}/>
<path d="M2.6 6 Q6 9 4 12" fill="none" ${s(1.2)}/>
</g>`,
        )
        .join("\n") +
        `\n<circle cx="32" cy="33" r="3.6" fill="${GOLD}" ${s(1.4)}/>`,
    ),
  dome: () =>
    wrap(
      "dome",
      "night",
      `<g fill="#fff4d2" opacity=".8"><circle cx="12" cy="12" r=".9"/><circle cx="20" cy="7" r=".7"/><circle cx="44" cy="9" r=".8"/><circle cx="54" cy="18" r=".7"/></g>
<path d="M2 52 L62 52 L62 64 L2 64 Z" fill="#2f6d4f"/>
<g fill="#5b6474" ${s(1.2)}><rect x="18" y="40" width="7" height="12"/><rect x="26" y="34" width="8" height="18"/><rect x="35" y="42" width="7" height="10"/><rect x="43" y="45" width="5" height="7"/></g>
<g fill="${GOLD_L}"><rect x="28" y="37" width="1.8" height="2"/><rect x="31" y="37" width="1.8" height="2"/><rect x="28" y="42" width="1.8" height="2"/><rect x="20" y="43" width="1.6" height="2"/><rect x="37" y="45" width="1.6" height="2"/></g>
<path d="M8 52 A24 24 0 0 1 56 52 Z" fill="#7fe0ff" opacity=".28"/>
<path d="M8 52 A24 24 0 0 1 56 52" fill="none" stroke="#9ff0ff" stroke-width="2.4"/>
<path d="M14 40 Q32 34 50 40 M20 31 Q32 27 44 31 M32 28 L32 52 M22 30.6 Q24 42 22 52 M42 30.6 Q40 42 42 52" fill="none" stroke="#9ff0ff" stroke-width=".9" opacity=".55"/>
<path d="M51 10 L45 20" stroke="#d9573f" stroke-width="3" stroke-linecap="round"/>
<path d="M44 22 l-3 -1 3.6 -2.6 0 -4.2 2.6 3.4 4 -.6 -2.6 3.4 1.4 3.8 -3.6 -1.6 -3 2.8z" fill="${GOLD_L}" ${s(1)}/>`,
    ),
  ship: () =>
    wrap(
      "ship",
      "sky",
      `<path d="M31 8 L31 44 M20 14 L20 44 M42 14 L42 44" ${s(1.8)}/>
<path d="M31 6 L38 8.6 L31 11 Z" fill="#d9573f" ${s(1.2)}/>
<path d="M23 12 Q31 15 39 12 L40 24 Q31 27 22 24 Z M24 26 Q31 29 38 26 L39 37 Q31 40 23 37 Z" fill="#f7f5ef" ${s(1.6)}/>
<path d="M13 17 Q20 19.6 27 17 L27.6 27 Q20 29.6 12.4 27 Z M13 29.4 Q20 32 27 29.4 L27.6 38 Q20 40.6 12.4 38 Z" fill="#f7f5ef" ${s(1.6)}/>
<path d="M36 17 Q42 19.6 48.4 17 L49 27 Q42 29.6 35.4 27 Z M36 29.4 Q42 32 48.4 29.4 L49 38 Q42 40.6 35.4 38 Z" fill="#f7f5ef" ${s(1.6)}/>
<path d="M8 42 L56 42 L50 53 L14 53 Z" fill="#8a5a34" ${s()}/>
<path d="M10.4 46 L53.6 46" stroke="${GOLD}" stroke-width="1.6"/>
<g fill="${O}"><circle cx="18" cy="49.4" r="1.2"/><circle cx="25" cy="49.4" r="1.2"/><circle cx="32" cy="49.4" r="1.2"/><circle cx="39" cy="49.4" r="1.2"/><circle cx="46" cy="49.4" r="1.2"/></g>
<path d="M0 55 q4-3 8 0 t8 0 8 0 8 0 8 0 8 0 8 0 8 0 V64 H0 Z" fill="#2b6fb0" ${s(1.4)}/>
<path d="M0 59.6 q4-2.4 8 0 t8 0 8 0 8 0 8 0 8 0 8 0 8 0" fill="none" stroke="#a9d4f0" stroke-width="1.2"/>`,
    ),
  cannon: () =>
    wrap(
      "cannon",
      "slate",
      `<path d="M4 54 L60 54 L60 64 L4 64 Z" fill="#3f9a5e" ${s(1.4)}/>
<g transform="rotate(-24 30 40)"><path d="M12 33 L50 35 Q54 35.2 54 40 Q54 44.8 50 45 L12 47 Q8 47 8 40 Q8 33 12 33 Z" fill="#43434f" ${s()}/>
<rect x="49" y="33.6" width="5" height="12.8" rx="2" fill="#5b6474" ${s(1.6)}/>
<path d="M18 33.4 L18 46.6 M30 34 L30 46" stroke="${GOLD}" stroke-width="1.8"/>
<circle cx="8" cy="40" r="2.6" fill="#43434f" ${s(1.6)}/></g>
<path d="M16 54 L22 40 L40 36 L44 54 Z" fill="#8a5a34" ${s()}/>
<circle cx="30" cy="51" r="8" fill="#a8714a" ${s()}/><circle cx="30" cy="51" r="2.4" fill="${GOLD}" ${s(1.2)}/>
<path d="M30 43 L30 59 M22 51 L38 51 M24.4 45.4 L35.6 56.6 M35.6 45.4 L24.4 56.6" stroke="${O}" stroke-width="1.2"/>
<g fill="#2b2b33" ${s(1.4)}><circle cx="47" cy="50.4" r="3.6"/><circle cx="54.4" cy="50.4" r="3.6"/><circle cx="50.7" cy="44.6" r="3.6"/></g>`,
    ),
  fort: () =>
    wrap(
      "fort",
      "sky",
      `<path d="M2 50 Q32 44 62 50 L62 64 L2 64 Z" fill="#3f9a5e" ${s(1.4)}/>
<path d="M32 7 L32 16" ${s(1.8)}/><path d="M32 7 L41 9.6 L32 12.4 Z" fill="#d9573f" ${s(1.2)}/>
<path d="M10 52 L10 30 L14 30 L14 26 L18 26 L18 30 L22 30 L22 26 L26 26 L26 30 L38 30 L38 26 L42 26 L42 30 L46 30 L46 26 L50 26 L50 30 L54 30 L54 52 Z" fill="#c9bfa8" ${s()}/>
<path d="M22 31 L22 16 L25 16 L25 19 L28 19 L28 16 L31 16 L31 19 L33 19 L33 16 L36 16 L36 19 L39 19 L39 16 L42 16 L42 31 Z" fill="#d9cfb6" ${s()}/>
<path d="M27 52 L27 43 Q32 37 37 43 L37 52 Z" fill="#6b3f22" ${s(1.6)}/>
<rect x="30" y="22" width="4" height="6" rx="2" fill="#2e2010"/><rect x="14.6" y="36" width="3.6" height="5" rx="1.8" fill="#2e2010"/><rect x="45.8" y="36" width="3.6" height="5" rx="1.8" fill="#2e2010"/>
<path d="M10 40 L54 40" stroke="#a89c82" stroke-width="1"/>`,
    ),
  anchor: () =>
    wrap(
      "anchor",
      "sea",
      `<path d="M32 15 L32 54 M22 22 L42 22 M12 38 Q14 54 32 54 Q50 54 52 38" fill="none" stroke="${O}" stroke-width="7" stroke-linecap="round"/>
<path d="M32 15 L32 54 M22 22 L42 22 M12 38 Q14 54 32 54 Q50 54 52 38" fill="none" stroke="#c4ccd8" stroke-width="3.8" stroke-linecap="round"/>
<path d="M7 41 L12 33 L17.6 41 Z M57 41 L52 33 L46.4 41 Z" fill="#c4ccd8" ${s(1.6)}/>
<circle cx="32" cy="11" r="5" fill="none" stroke="${O}" stroke-width="6"/><circle cx="32" cy="11" r="5" fill="none" stroke="#c4ccd8" stroke-width="2.8"/>
<path d="M36 11 Q50 14 44 26 Q38 36 46 44" fill="none" stroke="#c99a3a" stroke-width="2.2" stroke-dasharray="2.4 1.2"/>`,
    ),
  compass: () =>
    wrap(
      "compass",
      "sand",
      `<circle cx="32" cy="32" r="23" fill="#fbf1d6" ${s()}/>
<circle cx="32" cy="32" r="19" fill="none" stroke="#c99a3a" stroke-width="1.2"/>
<path d="M32 13 L35 29 L51 32 L35 35 L32 51 L29 35 L13 32 L29 29 Z" fill="#3b7fc4" ${s(1.6)}/>
<path d="M32 13 L35 29 L32 32 Z M51 32 L35 35 L32 32 Z M32 51 L29 35 L32 32 Z M13 32 L29 29 L32 32 Z" fill="#245a92"/>
<path d="M32 13 L35 29 L32 32 L29 29 Z" fill="#d9573f" ${s(1.2)}/>
<path d="M24 24 L32 29.6 L40 24 L34.4 32 L40 40 L32 34.4 L24 40 L29.6 32 Z" fill="${GOLD}" ${s(1.2)} opacity=".9"/>
<circle cx="32" cy="32" r="2.6" fill="#fbf1d6" ${s(1.4)}/>
<path d="M30 5.6 L30 10.4 L34 5.6 L34 10.4" fill="none" ${s(1.6)}/>`,
    ),
  crown: () =>
    wrap(
      "crown",
      "dusk",
      `<path d="M12 44 L9 20 L21 31 L32 14 L43 31 L55 20 L52 44 Z" fill="${GOLD}" ${s()}/>
<path d="M14 40 L50 40" stroke="${GOLD_D}" stroke-width="1.4"/>
<rect x="11" y="44" width="42" height="8" rx="2" fill="${GOLD}" ${s()}/>
<g ${s(1.2)}><circle cx="9" cy="20" r="2.6" fill="${GOLD_L}"/><circle cx="32" cy="14" r="3" fill="${GOLD_L}"/><circle cx="55" cy="20" r="2.6" fill="${GOLD_L}"/>
<circle cx="32" cy="34" r="3.4" fill="#d9573f"/><circle cx="21" cy="37" r="2.4" fill="#3b7fc4"/><circle cx="43" cy="37" r="2.4" fill="#3b7fc4"/>
<circle cx="20" cy="48" r="1.6" fill="#3a9d63"/><circle cx="32" cy="48" r="1.6" fill="#d9573f"/><circle cx="44" cy="48" r="1.6" fill="#3a9d63"/></g>
<path d="M17 25 L19 34" stroke="${GOLD_L}" stroke-width="1.6" opacity=".9"/>`,
    ),
  quill: () =>
    wrap(
      "quill",
      "peach",
      `<path d="M10 50 L54 46 L54 58 L10 60 Z" fill="#fbf1d6" ${s(1.6)}/>
<path d="M15 54 Q22 51 28 54 T40 53" fill="none" stroke="#5b6474" stroke-width="1.2"/>
<path d="M36 40 L48 40 L50 56 L34 56 Z" fill="#24345e" ${s()}/>
<rect x="38" y="36" width="8" height="5" rx="1.2" fill="#43434f" ${s(1.4)}/>
<path d="M42 38 Q30 26 22 8 Q30 12 36 18 Q34 13 33.6 9.6 Q42 18 44 34 Z" fill="#f7f5ef" ${s(1.8)}/>
<path d="M42 38 Q36 26 26.6 12" fill="none" ${s(1.2)}/>
<path d="M30.6 20 L34.4 18.6 M33 25 L37 23.6 M35.6 30 L39.4 28.8" stroke="#c8c2b0" stroke-width="1.1"/>`,
    ),
  coin: () =>
    wrap(
      "coin",
      "forest",
      `<g transform="translate(32 32) scale(2.05) translate(-12 -12)">
<circle cx="12" cy="12.6" r="10.4" fill="#a86b00"/>
<circle cx="12" cy="11.4" r="10.4" fill="#ffc531" stroke="${O}" stroke-width=".9"/>
<circle cx="12" cy="11.4" r="7.6" fill="none" stroke="#e0a100" stroke-width="1.4"/>
<path d="M9.4 6.9h2.7c2.9 0 4.6 2 4.6 4.8 0 2.7-1.8 4.7-4.7 4.7H9.4z" fill="none" stroke="#7a4b00" stroke-width="2.2" stroke-linejoin="round" transform="rotate(-7 12 11.5)"/>
</g>
<path d="M15 20 Q19 14 25 12" fill="none" stroke="#fff6c8" stroke-width="2.2" stroke-linecap="round" opacity=".8"/>`,
    ),
  // ---------------------------------------------------------------- emblems (badge-unlocked)
  laurel: () =>
    wrap(
      "laurel",
      "dark",
      `${ring}
${[1, -1]
  .map(
    (side) => `<g transform="translate(32 0) scale(${side} 1) translate(-32 0)">
<path d="M28 52 Q14 46 14 30 Q15 20 22 14" fill="none" stroke="${GOLD}" stroke-width="2"/>
${[
  [17.4, 45, -50],
  [14.4, 38, -70],
  [13.6, 30.6, -90],
  [15.4, 23.4, -110],
  [19, 17.4, -130],
]
  .map(
    ([x, y, r]) =>
      `<ellipse cx="${x}" cy="${y}" rx="5" ry="2.4" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="1" transform="rotate(${r} ${x} ${y})"/>`,
  )
  .join("")}
${[
  [22.4, 47.6, 20],
  [18.6, 40.4, 0],
  [18, 32.6, -20],
  [20, 25.6, -40],
]
  .map(
    ([x, y, r]) =>
      `<ellipse cx="${x}" cy="${y}" rx="4.2" ry="2" fill="${GOLD_L}" stroke="${GOLD_D}" stroke-width=".9" transform="rotate(${r} ${x} ${y})"/>`,
  )
  .join("")}
</g>`,
  )
  .join("\n")}
<path d="M24 38 L23 27 L28 32 L32 24 L36 32 L41 27 L40 38 Z" fill="${GOLD}" ${s(1.4)}/>
<rect x="23.6" y="38" width="16.8" height="3.6" rx="1" fill="${GOLD}" ${s(1.3)}/>
<path d="M27 52 L32 48 L37 52" fill="none" stroke="#d9573f" stroke-width="2.4"/>`,
    ),
  helm: () =>
    wrap(
      "helm",
      "dark",
      `${ring}
<path d="M30 10 Q44 6 48 18 Q40 13 33 16 Z" fill="#d9573f" ${s(1.4)}/>
<path d="M18 50 L17 30 Q17 15 32 14 Q47 15 47 30 L46 50 L38 50 L38 38 Q32 35 26 38 L26 50 Z" fill="${GOLD}" ${s()}/>
<path d="M32 14.4 L32 33" stroke="${GOLD_D}" stroke-width="2"/>
<path d="M20 30 Q32 25 44 30 L44 33 Q32 28.6 20 33 Z" fill="${GOLD_D}"/>
<path d="M22 44 Q20 38 21 34 M42 44 Q44 38 43 34" fill="none" stroke="${GOLD_L}" stroke-width="1.4"/>
<path d="M26 38 Q32 35 38 38 L38 50 L26 50 Z" fill="#17171c"/>`,
    ),
  sunburst: () =>
    wrap(
      "sunburst",
      "dark",
      `${ring}
<path d="${Array.from({ length: 16 }, (_, i) => {
        const a = (i * Math.PI) / 8 - Math.PI / 2;
        const r = i % 2 === 0 ? 22 : 11;
        return `${i === 0 ? "M" : "L"}${(32 + r * Math.cos(a)).toFixed(2)} ${(32 + r * Math.sin(a)).toFixed(2)}`;
      }).join(" ")} Z" fill="${GOLD}" ${s(1.6)}/>
<circle cx="32" cy="32" r="8" fill="#d9573f" ${s(1.6)}/>
<path d="M32 26.4 l1.7 3.5 3.8.5-2.8 2.6.7 3.8-3.4-1.8-3.4 1.8.7-3.8-2.8-2.6 3.8-.5z" fill="${GOLD_L}"/>`,
    ),
  globe: () =>
    wrap(
      "globe",
      "dark",
      `${ring}
<path d="M20 52 L44 52 M32 46 L32 52" ${s(2.4)}/><path d="M20 52 L44 52 M32 46 L32 52" stroke="${GOLD}" stroke-width="1.2"/>
<path d="M16 30 A16 16 0 0 0 46 38" fill="none" stroke="${GOLD}" stroke-width="2.6"/>
<circle cx="31" cy="29" r="14" fill="#3b7fc4" ${s()}/>
<path d="M22 22 Q26 18 30 21 Q29 26 24 27 Q20 26 22 22 Z M33 26 Q39 23 42 28 Q41 35 36 38 Q32 34 33 26 Z M26 34 Q29 33 30 37 Q27 40 25 37 Z" fill="#3a9d63" ${s(1)}/>
<ellipse cx="31" cy="29" rx="6" ry="14" fill="none" stroke="#a9d4f0" stroke-width=".9" opacity=".7"/>
<path d="M17 29 L45 29" stroke="#a9d4f0" stroke-width=".9" opacity=".7"/>`,
    ),
  calendar: () =>
    wrap(
      "calendar",
      "dark",
      `${ring}
<rect x="15" y="17" width="34" height="32" rx="3" fill="#fbf1d6" ${s()}/>
<path d="M15 26 L49 26 L49 20 Q49 17 46 17 L18 17 Q15 17 15 20 Z" fill="#d9573f" ${s()}/>
<path d="M22 13 L22 21 M42 13 L42 21" stroke="${GOLD}" stroke-width="3" stroke-linecap="round"/>
<g fill="#c8c2b0"><rect x="19" y="30" width="5" height="4" rx="1"/><rect x="26" y="30" width="5" height="4" rx="1"/><rect x="19" y="37" width="5" height="4" rx="1"/><rect x="26" y="37" width="5" height="4" rx="1"/><rect x="40" y="30" width="5" height="4" rx="1"/></g>
<path d="M40 34.6 l2.4 4.8 5.3.8-3.8 3.7.9 5.2-4.8-2.5-4.8 2.5.9-5.2-3.8-3.7 5.3-.8z" fill="${GOLD}" ${s(1.3)}/>`,
    ),
  crest: () =>
    wrap(
      "crest",
      "dark",
      `${ring}
<path d="M14 15 L50 15 L50 32 Q50 46 32 54 Q14 46 14 32 Z" fill="#245a92" ${s()}/>
<path d="M17.4 18 L46.6 18 L46.6 32 Q46.6 44 32 50.6 Q17.4 44 17.4 32 Z" fill="none" stroke="${GOLD}" stroke-width="1.8"/>
<path d="M32 46 L32 34 M32 38 L26 33 M32 36 L38 31" stroke="#c99a3a" stroke-width="2.4" stroke-linecap="round"/>
<circle cx="32" cy="27" r="8" fill="#3a9d63" ${s(1.6)}/><circle cx="25.4" cy="31.4" r="5" fill="#3a9d63" ${s(1.6)}/><circle cx="38.6" cy="31" r="5" fill="#3a9d63" ${s(1.6)}/>
<circle cx="29" cy="25" r="1.2" fill="${GOLD_L}"/><circle cx="35.6" cy="28" r="1.2" fill="${GOLD_L}"/><circle cx="25" cy="31" r="1.2" fill="${GOLD_L}"/>`,
    ),
  medal: () =>
    wrap(
      "medal",
      "dark",
      `${ring}
<path d="M22 10 L30 30 L36 27 L28 10 Z" fill="#d9573f" ${s(1.4)}/>
<path d="M42 10 L34 30 L28 27 L36 10 Z" fill="#3b7fc4" ${s(1.4)}/>
<circle cx="32" cy="39" r="13" fill="${GOLD}" ${s()}/>
<circle cx="32" cy="39" r="9.6" fill="none" stroke="${GOLD_D}" stroke-width="1.4"/>
<path d="M32 31.6 l2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1-3.8-3.6 5.2-.8z" fill="${GOLD_L}" ${s(1.1)}/>`,
    ),
  goldbanana: () =>
    wrap(
      "goldbanana",
      "dark",
      `${ring}
<g transform="translate(5 5) scale(.84)">
<path d="M45.5 13.5 47.6 5.2Q48 3.8 49.4 4.2l3.2 1q1.3.5.8 1.8l-3 8.6z" fill="${GOLD_D}" ${s(1.6)}/>
<path d="M46.4 12.6c8.2 5.8 10 21 2.2 32.6-7.2 10.6-22.2 15-35.8 11.2-3.2-.9-4.2-3.8-2.2-5.2 14-.4 25.2-7.2 30.4-17.6 3.2-6.4 3.4-13.4 2-18.4-.4-2 1.6-3.6 3.4-2.6z" fill="${GOLD}" ${s()}/>
<path d="M50.6 21.4c2.6 10.4 0 20.2-7 27.6-6.6 6.6-17.2 9.8-27.8 8.4 11.6-1 22.8-6 29-14.8 4.6-6.6 6.4-14 5.8-21.2z" fill="${GOLD_D}" opacity=".7"/>
<path d="M44.8 17c1.6 6.6.8 13.4-2.2 19.4" fill="none" stroke="#fff6c8" stroke-width="2.4" stroke-linecap="round"/>
</g>
<path d="M16 16 l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z M44 46 l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z M20 42 l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" fill="${GOLD_L}"/>`,
    ),
};

function main(): void {
  fs.mkdirSync(OUT, { recursive: true });
  const missing = PRESETS.filter((p) => !DRAW[p.id]);
  if (missing.length) throw new Error(`not drawn: ${missing.map((p) => p.id)}`);
  for (const p of PRESETS)
    fs.writeFileSync(path.join(OUT, `${p.id}.svg`), DRAW[p.id]());
  const at = process.argv.indexOf("--sheet");
  if (at > 0) {
    const sizes = [128, 48, 28];
    const cells = PRESETS.map(
      (p) =>
        `<figure>${sizes.map((z) => `<img src="file://${path.join(OUT, `${p.id}.svg`)}" width="${z}" height="${z}">`).join("")}<figcaption>${p.name}</figcaption></figure>`,
    ).join("");
    fs.writeFileSync(
      process.argv[at + 1],
      `<!doctype html><style>body{background:#131316;color:#a1a1aa;font:12px system-ui;display:flex;flex-wrap:wrap;gap:14px;padding:14px;margin:0}figure{margin:0;display:flex;align-items:center;gap:8px;flex-direction:row;flex-wrap:wrap;width:230px}img{border-radius:50%;box-shadow:0 0 0 2px rgba(255,255,255,.14)}figcaption{width:100%}</style>${cells}`,
    );
  }
  console.log(`drew ${PRESETS.length} pictures in ${path.relative(ROOT, OUT)}`);
}

main();
