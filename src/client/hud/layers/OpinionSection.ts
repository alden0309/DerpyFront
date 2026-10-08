import { Relation } from "@openfront/engine-api/game/GameTypes";
import { html, TemplateResult } from "lit";
import { translateText } from "../../Utils";
import type { AllianceView, OpinionViewModel, Tone } from "./OpinionView";

/**
 * The player panel's "Their opinion of you" section, for a nation or tribe
 * (see OpinionView for what goes in it). Styled like the rest of the panel.
 */

function pillClass(relation: Relation): string {
  const base =
    "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 " +
    "text-sm font-semibold shadow-[inset_0_0_8px_rgba(255,255,255,0.04)]";
  switch (relation) {
    case Relation.Hostile:
      return `${base} border-red-400/30 bg-red-500/10 text-red-200`;
    case Relation.Distrustful:
      return `${base} border-red-300/40 bg-red-300/10 text-red-300`;
    case Relation.Friendly:
      return `${base} border-emerald-400/30 bg-emerald-500/10 text-emerald-200`;
    case Relation.Neutral:
    default:
      return `${base} border-zinc-400/30 bg-zinc-500/10 text-zinc-200`;
  }
}

function markerClass(relation: Relation): string {
  switch (relation) {
    case Relation.Hostile:
      return "bg-red-400";
    case Relation.Distrustful:
      return "bg-red-300";
    case Relation.Friendly:
      return "bg-emerald-300";
    case Relation.Neutral:
    default:
      return "bg-zinc-200";
  }
}

function amountClass(tone: Tone): string {
  switch (tone) {
    case "good":
      return "text-emerald-300";
    case "bad":
      return "text-red-300";
    default:
      return "text-zinc-300";
  }
}

function allianceBoxClass(tone: Tone): string {
  switch (tone) {
    case "good":
      return "border-emerald-400/25 bg-emerald-500/[0.06]";
    case "bad":
      return "border-red-400/25 bg-red-500/[0.06]";
    default:
      return "border-amber-300/25 bg-amber-400/[0.06]";
  }
}

function verdictClass(tone: Tone): string {
  switch (tone) {
    case "good":
      return "text-emerald-200";
    case "bad":
      return "text-red-200";
    default:
      return "text-amber-100";
  }
}

const VERDICT_ICON: Record<Tone, string> = {
  good: "🤝",
  bad: "✋",
  neutral: "🎲",
};

const ROW_ICON: Record<Tone, string> = {
  good: "✓",
  bad: "✕",
  neutral: "±",
};

const subheading =
  "text-[12px] font-semibold uppercase tracking-[0.06em] text-zinc-400";

/** A -100..100 bar with the bands' edges marked and the value on it. */
function renderMeter(view: OpinionViewModel): TemplateResult {
  return html`
    <div
      class="relative mx-1.5 my-1 h-1.5 rounded-full bg-gradient-to-r from-red-500/55 via-zinc-500/40 to-emerald-500/55"
      role="meter"
      aria-label=${translateText("opinion.title")}
      aria-valuemin="-100"
      aria-valuemax="100"
      aria-valuenow=${view.value.replace("−", "-")}
      aria-valuetext=${`${view.relationLabel} ${view.value}`}
    >
      <span
        class="absolute top-1/2 left-1/4 h-3 w-px -translate-y-1/2 bg-white/15"
      ></span>
      <span
        class="absolute top-1/2 left-1/2 h-3 w-px -translate-y-1/2 bg-white/30"
      ></span>
      <span
        class="absolute top-1/2 left-3/4 h-3 w-px -translate-y-1/2 bg-white/15"
      ></span>
      <span
        class="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-zinc-900 shadow ${markerClass(
          view.relation,
        )}"
        style="left: ${view.meter}%"
      ></span>
    </div>
  `;
}

function renderReasons(view: OpinionViewModel): TemplateResult {
  return html`
    <div class="rounded-lg bg-zinc-800/70 p-2 ring-1 ring-zinc-700/60">
      ${view.reasons.length === 0
        ? html`<p class="px-1 text-[13px] text-zinc-400">
            ${translateText("opinion.nothing")}
          </p>`
        : html`<ul class="flex flex-col gap-1" role="list">
            ${view.reasons.map(
              (r) =>
                html`<li
                  class="flex items-baseline justify-between gap-3 px-1 text-[14px] leading-snug"
                  data-reason=${r.reason}
                >
                  <span class="min-w-0 text-zinc-100">${r.label}</span>
                  <span
                    class="shrink-0 font-semibold tabular-nums ${amountClass(
                      r.tone,
                    )}"
                    >${r.amount}</span
                  >
                </li>`,
            )}
          </ul>`}
      ${view.fading !== null
        ? html`<p
            class="mt-1.5 flex items-center gap-1.5 border-t border-white/5 px-1 pt-1.5 text-[12.5px] text-zinc-400"
          >
            <span aria-hidden="true">⏳</span>
            <span>${view.fading}</span>
          </p>`
        : ""}
    </div>
  `;
}

function renderTips(view: OpinionViewModel): TemplateResult | string {
  if (view.tribeNote !== null) {
    return html`<p class="px-1 text-[13px] text-zinc-400">
      ${view.tribeNote}
    </p>`;
  }
  if (view.tips.length === 0) return "";
  return html`
    <div class="px-1">
      <div class="${subheading} mb-1">
        ${translateText("opinion.improve_title")}
      </div>
      <ul
        class="flex flex-col gap-1 text-[13.5px] leading-snug text-zinc-200"
        role="list"
        data-testid="opinion-tips"
      >
        ${view.tips.map(
          (tip) =>
            html`<li class="flex gap-2">
              <span
                class="mt-[0.45em] size-1.5 shrink-0 rounded-full bg-sky-400/80"
                aria-hidden="true"
              ></span>
              <span>${tip}</span>
            </li>`,
        )}
      </ul>
    </div>
  `;
}

function renderAlliance(a: AllianceView): TemplateResult {
  return html`
    <div
      class="rounded-lg border p-2.5 ${allianceBoxClass(a.tone)}"
      data-testid="opinion-alliance"
    >
      <div class="${subheading}">${a.title}</div>
      <div
        class="mt-0.5 flex items-center gap-2 text-[15px] font-semibold leading-snug ${verdictClass(
          a.tone,
        )}"
      >
        <span aria-hidden="true">${VERDICT_ICON[a.tone]}</span>
        <span data-testid="opinion-verdict">${a.verdict}</span>
      </div>
      ${a.note !== null
        ? html`<p class="mt-1 text-[12.5px] leading-snug text-zinc-400">
            ${a.note}
          </p>`
        : ""}
      ${a.rows.length > 0
        ? html`<ul class="mt-2 flex flex-col gap-1 text-[13px]" role="list">
            ${a.rows.map(
              (row) =>
                html`<li
                  class="flex items-start justify-between gap-3 leading-snug"
                  data-gate=${row.gate}
                >
                  <span class="flex min-w-0 gap-1.5">
                    <span
                      class="w-3 shrink-0 text-center font-bold ${amountClass(
                        row.tone,
                      )}"
                      aria-hidden="true"
                      >${ROW_ICON[row.tone]}</span
                    >
                    <span class="text-zinc-200">${row.label}</span>
                  </span>
                  ${row.share !== null
                    ? html`<span class="shrink-0 tabular-nums text-zinc-400"
                        >${row.share}</span
                      >`
                    : ""}
                </li>`,
            )}
          </ul>`
        : ""}
    </div>
  `;
}

export function renderOpinionSection(view: OpinionViewModel): TemplateResult {
  return html`
    <section
      class="flex flex-col gap-2 select-none"
      aria-labelledby="opinion-title"
      data-testid="opinion-section"
    >
      <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div id="opinion-title" class="text-[15px] font-medium text-zinc-200">
          ${translateText("opinion.title")}
        </div>
        <span class=${pillClass(view.relation)} data-testid="opinion-value">
          ${view.relationLabel}
          <span class="tabular-nums">(${view.value})</span>
        </span>
      </div>
      ${renderMeter(view)} ${renderReasons(view)} ${renderTips(view)}
      ${renderAlliance(view.alliance)}
    </section>
  `;
}
