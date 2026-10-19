// NEWS (r25): /whats-new, Derp Land's What's New. Every entry this viewer
// may see, newest first, each with its date, its game and its body; a
// filter by game (the games the server says this viewer may see); and the
// ones new since they last looked marked "New". Opening the page marks
// everything seen, which takes the dot off the bar's What's New.

import { html, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { bananaMark, megaphoneIcon } from "../derpland/Icons";
import { news } from "../derpland/News";
import { renderNewsBody } from "../derpland/NewsBody";
import type { NewsEntry, NewsGame, NewsView } from "../derpland/NewsTypes";
import { HubPage } from "./HubPage";
import "./news.css";

/** "October 19, 2026" (the entry's day, wherever the reader is). */
export function newsDate(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

@customElement("dl-news")
export class DerpNews extends HubPage {
  @state() private view: NewsView | null = null;
  @state() private failed = false;
  @state() private filter = "all";
  /** New to this viewer when the page opened (marked seen since). */
  @state() private fresh = new Set<string>();

  protected async load(): Promise<void> {
    news.start();
    await news.load(true);
    const v = news.view;
    if (v === null) {
      this.failed = true;
      return;
    }
    this.failed = false;
    this.view = v;
    this.fresh = new Set(v.entries.slice(0, news.unseen).map((e) => e.id));
    if (!v.games.some((g) => g.id === this.filter)) this.filter = "all";
    void news.markAllSeen();
  }

  protected accountChanged(): void {
    // Signed in or out: what may be seen, and what's been seen, change.
    this.view = null;
    void this.load();
  }

  render(): TemplateResult {
    return html`
      <header class="dl-pagehead">
        <span class="dl-pageicon">${megaphoneIcon()}</span>
        <div>
          <h1 class="dl-h1">What's New</h1>
          <p class="dl-lede">
            What's changed on Derp Land and in its games, newest first.
          </p>
        </div>
      </header>
      ${this.renderBody()}
    `;
  }

  private renderBody(): TemplateResult {
    if (this.failed)
      return html`<p class="dl-quiet">
        What's New isn't available right now. Try again in a minute.
      </p>`;
    const v = this.view;
    if (v === null) return html`<p class="dl-quiet">Loading…</p>`;
    if (v.entries.length === 0) return renderEmpty();
    const games = new Map(v.games.map((g) => [g.id, g]));
    const shown =
      this.filter === "all"
        ? v.entries
        : v.entries.filter((e) => e.game === this.filter);
    const count = (id: string) =>
      id === "all"
        ? v.entries.length
        : v.entries.filter((e) => e.game === id).length;
    const filters: [string, string][] = [
      ["all", "All"],
      ...v.games.map((g): [string, string] => [g.id, g.name]),
    ];
    return html`
      <div class="dl-news-filters" role="tablist" aria-label="Which game">
        ${filters.map(
          ([id, name]) =>
            html`<button
              role="tab"
              aria-selected=${this.filter === id}
              @click=${() => (this.filter = id)}
            >
              ${name}<span class="dl-news-count">${count(id)}</span>
            </button>`,
        )}
      </div>
      ${shown.length === 0
        ? html`<p class="dl-news-none">
            Nothing for ${games.get(this.filter)?.name ?? "this game"} yet.
          </p>`
        : html`<ol class="dl-news-list">
            ${shown.map(
              (e) =>
                html`<li>
                  ${renderEntry(e, games.get(e.game), this.fresh.has(e.id))}
                </li>`,
            )}
          </ol>`}
    `;
  }
}

function renderEntry(
  e: NewsEntry,
  game: NewsGame | undefined,
  fresh: boolean,
): TemplateResult {
  return html`<article
    class="dl-news-entry ${fresh ? "fresh" : ""}"
    style="--tag:${game?.color ?? "#a1a1aa"}"
    aria-labelledby="news-${e.id}"
  >
    <div class="dl-news-meta">
      <time datetime=${e.date}>${newsDate(e.date)}</time>
      ${game ? html`<span class="dl-news-tag">${game.name}</span>` : nothing}
      ${fresh ? html`<span class="dl-news-new">New</span>` : nothing}
    </div>
    <div class="dl-news-text">
      <h2 class="dl-news-title" id="news-${e.id}">${e.title}</h2>
      <div class="dl-news-body">${renderNewsBody(e.body)}</div>
      ${e.link
        ? html`<a class="dl-news-link" href=${e.link}
            >${e.linkText ?? "Take a look"}<span aria-hidden="true">→</span></a
          >`
        : nothing}
    </div>
  </article>`;
}

function renderEmpty(): TemplateResult {
  return html`<div class="dl-news-empty">
    ${bananaMark("dl-banana mid")}
    <div>
      <h2 class="dl-h2">Nothing new yet</h2>
      <p>
        When something changes on Derp Land, in DerpyFront or in Derpy Conquest,
        it'll be written up here, newest first.
      </p>
      <a class="dl-news-link" href="/"
        >Back to Derp Land<span aria-hidden="true">→</span></a
      >
    </div>
  </div>`;
}

declare global {
  interface HTMLElementTagNameMap {
    "dl-news": DerpNews;
  }
}
