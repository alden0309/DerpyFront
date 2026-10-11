// How to Play (r11 wave 2): the in-game guide, a small book with a contents
// list, a search, and a chapter for every part of the game. It opens from
// the lobby, the register, the menu, the "?" on every page (at that page's
// chapter) and "I want to…". The chapters are written in a light markup
// (guide/Chapters.ts) so they read easily as text and can be searched:
//
//   ## A heading            - a list item           1. a numbered step
//   > Tip: advice           ! Pitfall: a warning    | a table | row |
//   **bold**  *italic*  [[chapter|a link to another chapter]]

import { html, LitElement, nothing, PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { TERMS } from "../ui/Terms";
import { CHAPTERS, PARTS, WORDS, type Chapter } from "./Chapters";

const BY_ID = new Map(CHAPTERS.map((c) => [c.id, c]));

/** The glossary is made from the same entries as the tooltips. */
const GLOSSARY: Chapter = {
  id: "glossary",
  part: "reference",
  title: "Glossary",
  line: "Every word the game counts by: what it is, what it's for, and how to raise it.",
  body: [
    ...Object.values(TERMS).map((t) => ({
      name: t.name,
      text: `## ${t.name}\n${t.what}\n- **What it's for:** ${t.good}\n- **How:** ${t.raise}\n- More: [[${t.ch}|${BY_ID.get(t.ch)?.title ?? t.ch}]]`,
    })),
    ...EXTRA_GLOSSARY(),
  ]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((x) => x.text)
    .join("\n\n"),
};

function EXTRA_GLOSSARY(): { name: string; text: string }[] {
  return [...CHAPTERS.flatMap((c) => c.glossary ?? []), ...WORDS].map(
    ([name, text, ch]) => ({
      name,
      text: `## ${name}\n${text}${ch ? `\n- More: [[${ch}|${BY_ID.get(ch)?.title ?? ch}]]` : ""}`,
    }),
  );
}

const ALL: Chapter[] = [...CHAPTERS, GLOSSARY];
BY_ID.set("glossary", GLOSSARY);

// ---------------------------------------------------------------- markup

/** **bold**, *italic*, [[chapter|link]] inside a line. */
function inline(
  t: string,
  go: (id: string) => void,
): (string | TemplateResult)[] {
  const out: (string | TemplateResult)[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[\[[^\]]+\]\])/g;
  let last = 0;
  for (const m of t.matchAll(re)) {
    if (m.index! > last) out.push(t.slice(last, m.index));
    const x = m[0];
    if (x.startsWith("**")) out.push(html`<b>${x.slice(2, -2)}</b>`);
    else if (x.startsWith("[[")) {
      const [id, label] = x.slice(2, -2).split("|");
      out.push(
        html`<button class="cq-guide-xref" @click=${() => go(id)}>
          ${label ?? BY_ID.get(id)?.title ?? id}
        </button>`,
      );
    } else out.push(html`<i>${x.slice(1, -1)}</i>`);
    last = m.index! + x.length;
  }
  if (last < t.length) out.push(t.slice(last));
  return out;
}

/** A header cell's words, without the markup (a phone's stacked table labels). */
function strip(t: string): string {
  return t.replace(/\*\*|\*|\[\[[^|\]]+\||\]\]/g, "");
}

/** A chapter's text, as blocks. */
export function renderBody(
  body: string,
  go: (id: string) => void,
): TemplateResult[] {
  const out: TemplateResult[] = [];
  for (const block of body.split(/\n\s*\n/)) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (l.startsWith("## ")) {
        out.push(html`<h3 class="cq-guide-h">${inline(l.slice(3), go)}</h3>`);
        i++;
      } else if (l.startsWith("- ")) {
        const items: string[] = [];
        while (i < lines.length && lines[i].startsWith("- "))
          items.push(lines[i++].slice(2));
        out.push(
          html`<ul class="cq-guide-list">
            ${items.map((x) => html`<li>${inline(x, go)}</li>`)}
          </ul>`,
        );
      } else if (/^\d+\. /.test(l)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+\. /.test(lines[i]))
          items.push(lines[i++].replace(/^\d+\. /, ""));
        out.push(
          html`<ol class="cq-guide-steps">
            ${items.map((x) => html`<li>${inline(x, go)}</li>`)}
          </ol>`,
        );
      } else if (l.startsWith("|")) {
        const rows: string[][] = [];
        while (i < lines.length && lines[i].startsWith("|")) {
          const cells = lines[i++]
            .replace(/^\||\|$/g, "")
            .split("|")
            .map((c) => c.trim());
          if (cells.every((c) => /^-+$/.test(c))) continue;
          rows.push(cells);
        }
        const [head, ...rest] = rows;
        out.push(
          html`<div class="cq-guide-tablewrap">
            <table class="cq-guide-table">
              <thead>
                <tr>
                  ${head.map((c) => html`<th>${inline(c, go)}</th>`)}
                </tr>
              </thead>
              <tbody>
                ${rest.map(
                  (r) =>
                    html`<tr>
                      ${r.map(
                        (c, i) =>
                          html`<td data-label=${strip(head[i] ?? "")}>
                            ${inline(c, go)}
                          </td>`,
                      )}
                    </tr>`,
                )}
              </tbody>
            </table>
          </div>`,
        );
      } else if (l.startsWith("> ") || l.startsWith("! ")) {
        const warn = l.startsWith("! ");
        const text: string[] = [];
        while (i < lines.length && lines[i].startsWith(warn ? "! " : "> "))
          text.push(lines[i++].slice(2));
        const joined = text.join(" ");
        const m = /^(Tip|Pitfall|Example|Note):\s*/.exec(joined);
        out.push(
          html`<aside class="cq-guide-note ${warn ? "warn" : ""}">
            ${m ? html`<b class="cq-guide-note-k">${m[1]}</b>` : nothing}
            ${inline(m ? joined.slice(m[0].length) : joined, go)}
          </aside>`,
        );
      } else {
        const text: string[] = [];
        while (i < lines.length && !/^(## |- |\d+\. |\||> |! )/.test(lines[i]))
          text.push(lines[i++]);
        out.push(html`<p>${inline(text.join(" "), go)}</p>`);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- search

const plainOf = new Map<string, string>();
function plainText(c: Chapter): string {
  let t = plainOf.get(c.id);
  if (t === undefined) {
    t = `${c.title}\n${c.line}\n${c.body}`
      .replace(/^\s*(- |\d+\. |##\s*)/gm, "")
      .replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/[*#>|!]/g, " ")
      .replace(/\s+/g, " ");
    plainOf.set(c.id, t);
  }
  return t;
}

interface Hit {
  c: Chapter;
  score: number;
  snippet: string;
}

function search(q: string): Hit[] {
  const words = q
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);
  if (!words.length) return [];
  const out: Hit[] = [];
  for (const c of ALL) {
    const t = plainText(c);
    const low = t.toLowerCase();
    let score = 0;
    let first = -1;
    for (const w of words) {
      const at = low.indexOf(w);
      if (at < 0) {
        score = 0;
        break;
      }
      if (first < 0 || at < first) first = at;
      score += 1 + low.split(w).length;
      if (c.title.toLowerCase().includes(w)) score += 12;
    }
    if (!score) continue;
    const from = Math.max(0, first - 70);
    const snippet = `${from > 0 ? "…" : ""}${t.slice(from, first + 130).trim()}…`;
    out.push({ c, score, snippet });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 14);
}

function mark(text: string, q: string): (string | TemplateResult)[] {
  const words = q
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return [text];
  const re = new RegExp(`(${words.join("|")})`, "gi");
  return text
    .split(re)
    .map((part, i) => (i % 2 ? html`<mark>${part}</mark>` : part));
}

// ---------------------------------------------------------------- the book

/** The chapter last read, so the book opens where you left it. */
let lastRead = "start";

@customElement("cq-guide")
export class GuideView extends LitElement {
  /** The chapter to open at (or the last one read). */
  @property({ attribute: false }) chapter: string | undefined;
  @state() private at = "";
  @state() private q = "";
  /** On a phone, the contents list is folded away while reading. */
  @state() private contents = false;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.at = BY_ID.has(this.chapter ?? "") ? this.chapter! : lastRead;
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    // Opened again at another chapter (a "?" pressed elsewhere).
    if (changed.has("chapter") && this.chapter && BY_ID.has(this.chapter))
      if (changed.get("chapter") !== undefined) this.go(this.chapter);
  }

  private go(id: string): void {
    if (!BY_ID.has(id)) return;
    this.at = id;
    lastRead = id;
    this.q = "";
    this.contents = false;
    this.updateComplete.then(() =>
      this.querySelector(".cq-guide-page")?.scrollTo(0, 0),
    );
  }

  private close(): void {
    this.dispatchEvent(new CustomEvent("cq-close", { bubbles: true }));
  }

  render(): TemplateResult {
    const c = BY_ID.get(this.at) ?? CHAPTERS[0];
    const idx = ALL.indexOf(c);
    const prev = ALL[idx - 1];
    const next = ALL[idx + 1];
    const hits = this.q.trim() ? search(this.q.trim()) : null;
    const go = (id: string) => this.go(id);
    return html`<div class="cq-guide ${this.contents ? "show-contents" : ""}">
      <aside class="cq-guide-side" aria-label="Contents">
        <p class="cq-guide-book">Derpy Conquest</p>
        <h2 class="cq-guide-booktitle">How to Play</h2>
        <label class="cq-guide-search">
          <input
            type="search"
            placeholder="Search the guide"
            aria-label="Search the guide"
            .value=${this.q}
            @input=${(e: Event) =>
              (this.q = (e.target as HTMLInputElement).value)}
          />
        </label>
        <nav class="cq-guide-toc">
          ${PARTS.map(
            (p) =>
              html`<p class="cq-guide-part">${p.title}</p>
                <ol>
                  ${ALL.filter((x) => x.part === p.id).map(
                    (x) =>
                      html`<li>
                        <button
                          class=${x.id === c.id && !hits ? "on" : ""}
                          aria-current=${x.id === c.id ? "page" : "false"}
                          @click=${() => go(x.id)}
                        >
                          ${x.title}
                        </button>
                      </li>`,
                  )}
                </ol>`,
          )}
        </nav>
      </aside>
      <article class="cq-guide-page" aria-live="polite">
        <div class="cq-guide-bar">
          <button
            class="cq-btn small quiet cq-guide-contents-btn"
            @click=${() => (this.contents = !this.contents)}
          >
            ${this.contents ? "Close contents" : "Contents & search"}
          </button>
          <span></span>
          <button
            class="cq-modal-x"
            aria-label="Close"
            @click=${() => this.close()}
          >
            ×
          </button>
        </div>
        ${hits
          ? html`<p class="cq-guide-kicker">Search</p>
              <h2 class="cq-guide-title">“${this.q.trim()}”</h2>
              ${hits.length
                ? html`<ul class="cq-guide-hits">
                    ${hits.map(
                      (h) =>
                        html`<li>
                          <button @click=${() => go(h.c.id)}>
                            <b>${h.c.title}</b>
                            <span>${mark(h.snippet, this.q)}</span>
                          </button>
                        </li>`,
                    )}
                  </ul>`
                : html`<p class="cq-muted">
                    Nothing found. Try another word, or look in the Glossary.
                  </p>`}`
          : html`<p class="cq-guide-kicker">
                ${PARTS.find((p) => p.id === c.part)?.title ?? ""}
              </p>
              <h2 class="cq-guide-title">${c.title}</h2>
              <p class="cq-guide-line">${c.line}</p>
              ${c.where
                ? html`<p class="cq-guide-where">
                    <b>Where:</b> ${inline(c.where, go)}
                  </p>`
                : nothing}
              <div class="cq-guide-body">${renderBody(c.body, go)}</div>
              <nav class="cq-guide-turn" aria-label="Turn the page">
                ${prev
                  ? html`<button @click=${() => go(prev.id)}>
                      <small>‹ Before</small>${prev.title}
                    </button>`
                  : html`<span></span>`}
                ${next
                  ? html`<button class="next" @click=${() => go(next.id)}>
                      <small>Next ›</small>${next.title}
                    </button>`
                  : html`<span></span>`}
              </nav>`}
      </article>
    </div>`;
  }
}

/** The guide over whatever's showing, with a dimmed ground behind. */
export function guideOverlay(
  chapter: string | undefined,
  close: () => void,
): TemplateResult {
  return html`<div
    class="cq-scrim cq-guide-scrim"
    @click=${(e: Event) => e.target === e.currentTarget && close()}
    @cq-close=${close}
  >
    <cq-guide .chapter=${chapter} role="dialog" aria-modal="true"></cq-guide>
  </div>`;
}

declare global {
  interface HTMLElementTagNameMap {
    "cq-guide": GuideView;
  }
}
