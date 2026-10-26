// ADMIN (r26): What's New, read-only (entries are written through Claude):
// every entry, Mr. Based's too, and how many accounts haven't seen each.

import { html, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { renderNewsBody } from "../../derpland/NewsBody";
import type { NewsEntry } from "../../derpland/NewsTypes";
import { newsIcon } from "../icons";
import { AdminPage } from "../Page";
import { registerSection } from "../Registry";
import { nf } from "../ui";

interface NewsData {
  games: { id: string; name: string; color: string; secret?: true }[];
  looked: number;
  never: number;
  entries: (NewsEntry & { unseen: number; seen: number; audience: number })[];
}

@customElement("adm-news")
export class AdminNews extends AdminPage {
  @state() private data: NewsData | null = null;

  protected async fetch(): Promise<void> {
    this.data = await this.view.get<NewsData>("/news");
  }

  render(): TemplateResult {
    const d = this.data;
    return html`<div class="adm-head">
        <div>
          <h1>What's New</h1>
          <p class="adm-sub">
            Read-only: entries are written through Claude. Unseen counts are of
            the accounts that have looked at What's New at least once
            (${d
              ? html`${nf(d.looked)} have, ${nf(d.never)} haven't yet`
              : "…"}).
          </p>
        </div>
        <a class="dl-btn ghost small" href="/whats-new" target="_blank"
          >The page</a
        >
      </div>
      ${this.error ? this.failed() : nothing}
      ${d
        ? d.entries.length === 0
          ? html`<div class="adm-box">
              <p class="adm-empty">No entries yet.</p>
            </div>`
          : html`<div class="adm-grid">
              ${d.entries.map((e) => this.entry(e, d))}
            </div>`
        : html`<p class="adm-quiet">Loading…</p>`}`;
  }

  private entry(e: NewsData["entries"][number], d: NewsData): TemplateResult {
    const g = d.games.find((x) => x.id === e.game);
    const share = e.audience > 0 ? e.unseen / e.audience : 0;
    return html`<article class="adm-box">
      <h2>
        <span
          class="adm-pill"
          style="background:${g?.color ?? "#555"}26;color:${g?.color ??
          "inherit"}"
          >${g?.name ?? e.game}</span
        >
        ${e.title}
        <span class="adm-aside">${e.date}</span>
      </h2>
      <div class="adm-split">
        <div class="adm-news-body adm-quiet">
          ${renderNewsBody(e.body)}
          ${e.link
            ? html`<p class="adm-small" style="margin-top:6px">
                Link: ${e.linkText ?? "Take a look"} →
                <span class="adm-mono">${e.link}</span>
              </p>`
            : nothing}
        </div>
        <div>
          <div
            class="adm-row"
            style="justify-content:space-between;font-size:14px"
          >
            <span
              >Not seen by <b>${nf(e.unseen)}</b> of
              ${nf(e.audience)}${g?.secret ? " (its players)" : ""}</span
            >
            <span class="adm-small">${nf(e.seen)} seen</span>
          </div>
          <div class="adm-bar" style="margin-top:6px">
            <span style="width:${Math.round((1 - share) * 100)}%"></span>
          </div>
          <p class="adm-small adm-mono" style="margin-top:6px">${e.id}</p>
        </div>
      </div>
    </article>`;
  }
}

registerSection({
  id: "news",
  label: "What's New",
  order: 70,
  icon: () => newsIcon(),
  render: (view) => html`<adm-news .view=${view}></adm-news>`,
});
