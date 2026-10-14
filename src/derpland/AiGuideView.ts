// SITE (r22): the Derp Store's guide to DerpyFront's AI personality packs,
// drawn the same on Derp Land's /store and DerpyFront's store page: the
// packs and the temperaments side by side, and each pack's "How it plays".
// The words come through `GuideWords`, English on Derp Land and
// translateText in DerpyFront (both from AiGuide.ts's text).

import {
  TEMPERAMENTS,
  type Temperament,
} from "@openfront/engine-lib/game/AiPersonalities";
import { html, nothing, TemplateResult } from "lit";
import {
  AI_ASPECTS,
  GUIDE_COLUMNS,
  guideParams,
  GuideText,
  packMix,
  samePlayAs,
} from "./AiGuide";

export interface GuideWords {
  /** One of the guide's words (AiGuide.ts keys), filled. */
  t: GuideText;
  /** A temperament's name and one-line hint. */
  temperament: (t: Temperament) => { label: string; hint: string };
  /** A pack's name, as the store shows it. */
  packName: (id: string) => string;
}

function columnLabel(w: GuideWords, c: (typeof GUIDE_COLUMNS)[number]) {
  return c === "usual" ? w.t("usual") : w.temperament(c).label;
}

/** The packs side by side: how many of each temperament, and the lean. */
function packsTable(w: GuideWords, packs: readonly string[]): TemplateResult {
  return html`<div class="dai-scroll" tabindex="0">
    <table class="dai-table dai-packs">
      <thead>
        <tr>
          <th scope="col">${w.t("col_pack")}</th>
          ${TEMPERAMENTS.map(
            (t) =>
              html`<th scope="col" title=${w.temperament(t).hint}>
                <span class="dfx-temper" data-temperament=${t}
                  >${w.temperament(t).label}</span
                >
              </th>`,
          )}
          <th scope="col">${w.t("col_leans")}</th>
        </tr>
      </thead>
      <tbody>
        ${packs.map((id) => {
          const mix = packMix(id);
          return html`<tr>
            <th scope="row">${w.packName(id)}</th>
            ${TEMPERAMENTS.map(
              (t) =>
                html`<td class="dai-count" data-n=${mix[t]}>
                  ${mix[t] > 0 ? mix[t] : "–"}
                </td>`,
            )}
            <td class="dai-lean">${w.t(`${id}_short`)}</td>
          </tr>`;
        })}
      </tbody>
    </table>
  </div>`;
}

/** The temperaments (and a nation with no pack) side by side, aspect by aspect. */
function temperamentsTable(w: GuideWords): TemplateResult {
  return html`<div class="dai-scroll" tabindex="0">
    <table class="dai-table dai-temps">
      <thead>
        <tr>
          <td></td>
          ${GUIDE_COLUMNS.map(
            (c) =>
              html`<th scope="col">
                ${c === "usual"
                  ? html`<span class="dfx-temper">${columnLabel(w, c)}</span>`
                  : html`<span class="dfx-temper" data-temperament=${c}
                      >${columnLabel(w, c)}</span
                    >`}
              </th>`,
          )}
        </tr>
      </thead>
      <tbody>
        ${AI_ASPECTS.map(
          (a) =>
            html`<tr>
              <th scope="row">${w.t(`aspect_${a}`)}</th>
              ${GUIDE_COLUMNS.map(
                (c) =>
                  html`<td class=${c === "usual" ? "dai-usual" : ""}>
                    ${w.t(`${c}_${a}`, guideParams(c))}
                  </td>`,
              )}
            </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

/** The tab's comparison: how packs work, then the two tables. */
export function aiCompare(
  w: GuideWords,
  packs: readonly string[],
): TemplateResult {
  return html`<section class="dai-compare" aria-label=${w.t("title")}>
    <h2 class="dai-h">${w.t("title")}</h2>
    <p class="dai-intro">${w.t("intro")}</p>
    <h3 class="dai-sub">${w.t("packs_title")}</h3>
    ${packsTable(w, packs)}
    <h3 class="dai-sub">${w.t("temperaments_title")}</h3>
    ${temperamentsTable(w)}
  </section>`;
}

/** A pack's mix of temperaments as a bar, six segments. */
function mixBar(w: GuideWords, id: string): TemplateResult {
  const mix = packMix(id);
  return html`<div class="dai-mix" role="list">
    ${TEMPERAMENTS.filter((t) => mix[t] > 0).map(
      (t) =>
        html`<span
          role="listitem"
          class="dai-seg"
          data-temperament=${t}
          style="flex-grow:${mix[t]}"
          title=${w.temperament(t).hint}
          >${mix[t]} × ${w.temperament(t).label}</span
        >`,
    )}
  </div>`;
}

/** A pack's "How it plays": its lean, its mix, and each aspect in a line. */
export function packPlays(w: GuideWords, id: string): TemplateResult {
  const same = samePlayAs(id);
  return html`<div class="dai-plays">
    <h3 class="dai-sub">${w.t("plays_title")}</h3>
    ${mixBar(w, id)}
    <p class="dai-leanline">
      ${w.t(`${id}_lean`)}
      ${same.length > 0
        ? w.t("same_play", { packs: same.map((p) => w.packName(p)).join(", ") })
        : nothing}
    </p>
    <dl class="dai-aspects">
      ${AI_ASPECTS.map(
        (a) =>
          html`<div>
            <dt>${w.t(`aspect_${a}`)}</dt>
            <dd>${w.t(`${id}_${a}`)}</dd>
          </div>`,
      )}
    </dl>
  </div>`;
}

/** Styles for the guide; StorePreviews.ensurePreviewStyles adds them. */
export const AI_GUIDE_CSS = `
.dai-compare{--dai-bg:#1b1b1f;margin:0 0 26px;padding:18px;border:1px solid #ffffff1f;border-radius:12px;background:var(--dai-bg);min-width:0}
.dai-h{margin:0 0 6px;font-size:18px;font-weight:750;line-height:1.25}
.dai-intro{margin:0 0 14px;font-size:14px;line-height:1.5;color:#a1a1aa;max-width:76ch}
.dai-sub{margin:16px 0 8px;font-size:12px;font-weight:750;letter-spacing:.06em;text-transform:uppercase;color:#a1a1aa}
.dai-plays .dai-sub{margin-top:18px}
.dai-scroll{overflow-x:auto;max-width:100%;-webkit-overflow-scrolling:touch;border-radius:8px}
.dai-scroll:focus-visible{outline:2px solid #f5cc3c;outline-offset:2px}
.dai-table{border-collapse:collapse;font-size:13px;line-height:1.4}
.dai-table th,.dai-table td{padding:8px 10px;border-bottom:1px solid #ffffff14;text-align:left;vertical-align:top}
.dai-table thead th{border-bottom:1px solid #ffffff2e;white-space:nowrap}
.dai-table tbody tr:last-child th,.dai-table tbody tr:last-child td{border-bottom:0}
.dai-table tbody th{font-weight:650;white-space:nowrap}
.dai-packs{width:100%}
.dai-packs .dai-count{text-align:center;font-weight:750;font-variant-numeric:tabular-nums}
.dai-packs thead th:not(:first-child):not(:last-child){text-align:center}
.dai-count[data-n="0"]{color:#71717a;font-weight:400}
.dai-count[data-n="2"],.dai-count[data-n="3"]{color:#fde68a}
.dai-lean{white-space:nowrap;color:#d4d4d8}
.dai-temps{min-width:1040px;table-layout:fixed}
.dai-temps td{width:15%;color:#d4d4d8}
.dai-temps td.dai-usual{color:#a1a1aa;background:#ffffff08}
.dai-temps tbody th,.dai-temps thead td{position:sticky;left:0;z-index:1;width:104px;background:var(--dai-bg,#1b1b1f)}
.dai-mix{display:flex;gap:3px;margin:0 0 10px;max-width:560px}
.dai-seg{flex:1 1 0;min-width:0;padding:4px 8px;border-radius:6px;font-size:11.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:#ffffff14;color:#d4d4d8}
.dai-seg[data-temperament=aggressive]{background:#ef444433;color:#fca5a5}
.dai-seg[data-temperament=trader]{background:#eab30833;color:#fde047}
.dai-seg[data-temperament=turtle]{background:#22c55e33;color:#86efac}
.dai-seg[data-temperament=nuker]{background:#a855f733;color:#d8b4fe}
.dai-seg[data-temperament=opportunist]{background:#3b82f633;color:#93c5fd}
.dai-leanline{margin:0 0 10px;font-size:14px;line-height:1.5;color:#e4e4e7;max-width:76ch}
.dai-aspects{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px 18px;margin:0 0 4px}
.dai-aspects div{min-width:0}
.dai-aspects dt{font-size:11px;font-weight:750;letter-spacing:.06em;text-transform:uppercase;color:#a1a1aa}
.dai-aspects dd{margin:2px 0 0;font-size:13.5px;line-height:1.45;color:#d4d4d8}
@media (max-width:560px){.dai-compare{padding:14px}.dai-mix{flex-wrap:wrap}.dai-seg{flex:1 1 40%}}
`;
