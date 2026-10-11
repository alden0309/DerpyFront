// Your journal: what happened to you, day by day, across the generations,
// and the handful of moments that make up the story so far.

import { html, nothing, TemplateResult } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { formatDate } from "../../engine/Calendar";
import { charName } from "../../engine/Queries";
import type { JournalEntry } from "../../engine/Types";
import { LetterIcon } from "../Icons";
import { GameUi, section } from "./Context";
import { pageHead } from "./Nav";
import { leadsSection } from "./WorldUi";

let filter: "all" | "good" | "bad" = "all";
let shown = 60;

/** The Journal's pages: the diary (and what waits on you), leads, the story. */
export function journalTab(ui: GameUi, sub = "diary"): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  if (!life)
    return html`<p class="cq-empty">
      Nothing written yet. Make a character, or take over someone.
    </p>`;
  if (sub === "leads")
    return html`${pageHead(
      "Leads",
      "Stories worth chasing: gold in the hills, a wreck, cheap land, a price on an outlaw's head. Each is pinned on the map with a red seal.",
    )}
    ${leadsSection(ui)}`;
  if (sub === "story") {
    const milestones = life.milestones;
    return html`${pageHead(
      "The story so far",
      life.line.length > 1
        ? `${life.line.length} generations of the ${s.chars[life.line[0]]?.family ?? ""} line: the moments that made it.`
        : "The moments that made your life, as they'll be told in 1776.",
      html`<div class="cq-btnrow">
        <button class="cq-btn small" @click=${() => ui.modal({ k: "end" })}>
          Your story, told
        </button>
      </div>`,
    )}
    ${milestones.length
      ? html`<ol class="cq-timeline compact">
          ${milestones
            .slice()
            .reverse()
            .map(
              (m) =>
                html`<li class=${m.kind === "died" ? "bad" : ""}>
                  <time>${formatDate(m.day)}</time><span>${m.text}</span>
                </li>`,
            )}
        </ol>`
      : html`<p class="cq-empty">Nothing worth the telling yet.</p>`}`;
  }
  const entries = life.journal
    .filter((e) => filter === "all" || e.tone === filter)
    .slice()
    .reverse();
  const keys = keysOf(entries);
  const set = (f: typeof filter) => {
    filter = f;
    shown = 60;
    ui.redraw();
  };
  return html`${pageHead(
      "Diary",
      "Your days as they went, newest first, and anything waiting for your answer.",
    )}
    ${section(
      "Waiting on you",
      life.events.length
        ? html`<ul class="cq-list">
            ${life.events.map(
              (e) =>
                html`<li>
                  <button
                    class="cq-link"
                    @click=${() => ui.modal({ k: "event", id: e.id })}
                  >
                    ${LetterIcon()} ${e.title}
                  </button>
                  <span class="cq-muted small"
                    >decides itself ${formatDate(e.expires)}</span
                  >
                </li>`,
            )}
          </ul>`
        : html`<p class="cq-muted small">
            Nothing waits on you. Letters wanting an answer are in Society ›
            Letters.
          </p>`,
    )}
    <div class="cq-seg small" role="radiogroup" aria-label="Show">
      ${(
        [
          ["all", "Everything"],
          ["good", "Good"],
          ["bad", "Bad"],
        ] as const
      ).map(
        ([k, label]) =>
          html`<button
            role="radio"
            aria-checked=${filter === k}
            @click=${() => set(k)}
          >
            ${label}
          </button>`,
      )}
    </div>
    <ol class="cq-journal">
      ${entries.length === 0
        ? html`<li class="cq-muted">Nothing yet.</li>`
        : nothing}
      ${repeat(
        entries.slice(0, shown).map((e, i) => ({ e, i })),
        ({ e }) => keys.get(e)!,
        ({ e, i }) => entry(ui, e, entries[i - 1]),
      )}
    </ol>
    ${entries.length > shown
      ? html`<button
          class="cq-btn small quiet"
          @click=${() => {
            shown += 100;
            ui.redraw();
          }}
        >
          Older entries
        </button>`
      : nothing}`;
}

/**
 * Keys for entries that stay the same as new ones come in above them (the
 * same words on the same day are told apart by counting from the oldest).
 */
function keysOf(entries: JournalEntry[]): Map<JournalEntry, string> {
  const count = new Map<string, number>();
  const out = new Map<JournalEntry, string>();
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    const base = `${e.day}|${e.c}|${e.text}`;
    const n = count.get(base) ?? 0;
    count.set(base, n + 1);
    out.set(e, `${base}|${n}`);
  }
  return out;
}

function entry(
  ui: GameUi,
  e: JournalEntry,
  prev: JournalEntry | undefined,
): TemplateResult {
  const many = (ui.life?.line.length ?? 1) > 1;
  const who =
    many && (!prev || prev.c !== e.c) && ui.s.chars[e.c]
      ? html`<li class="cq-journal-who">${charName(ui.s.chars[e.c])}</li>`
      : nothing;
  return html`${who}
    <li class=${e.tone ?? ""}>
      <time>${formatDate(e.day)}</time>
      <span>${e.text}</span>
    </li>`;
}
