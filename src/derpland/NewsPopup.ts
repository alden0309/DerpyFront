// NEWS (r25): the one small card a page shows when there's news for it (the
// Derp Land home, DerpyFront's menu, Conquest's start screen): the newest
// new entry's title and body, "and N more" with a link to What's New when
// there are more, and the entry's own link when it has one. Closing it, or
// following a link, marks them seen (News.ts). Loaded only when a card is
// shown, so no page pays for it otherwise.
//
// In a shadow root, like the bar, so the games' own CSS can't restyle it.

import { css, html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { closeIcon, megaphoneIcon } from "./Icons";
import type { NewsCard } from "./News";
import { renderNewsBody } from "./NewsBody";
import { englishNews, type NewsTranslate } from "./NewsText";

@customElement("derp-news-card")
export class DerpNewsCard extends LitElement {
  @property({ attribute: false }) card!: NewsCard;
  @property({ attribute: false }) text: NewsTranslate = englishNews;
  /** DerpyFront's blue instead of Derp Land's banana. */
  @property({ type: Boolean, reflect: true }) blue = false;
  /** The player is done with it. */
  onDone: () => void = () => {};
  private done = false;

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("keydown", this.onKey);
  }

  disconnectedCallback(): void {
    document.removeEventListener("keydown", this.onKey);
    super.disconnectedCallback();
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.dismiss();
  };

  /** Taken away, nothing marked (the page moved on: a game is starting). */
  close(): void {
    this.remove();
  }

  /** Closed by the player: those entries are seen. */
  private dismiss(): void {
    this.finish();
    this.remove();
  }

  /**
   * A link followed: seen too. The card stays while the page goes (a link
   * taken out of the page as it's clicked goes nowhere).
   */
  private follow(): void {
    this.finish();
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.onDone();
  }

  render(): TemplateResult {
    const { entry, game, more } = this.card;
    const t = this.text;
    return html`<aside
      class="card"
      role="dialog"
      aria-labelledby="news-title"
      aria-describedby="news-body"
    >
      <div class="top">
        <span class="kicker">${megaphoneIcon("ic")}${t("whats_new")}</span>
        ${game
          ? html`<span class="tag" style="--tag:${game.color}"
              >${game.name}</span
            >`
          : nothing}
        <button
          class="x"
          aria-label=${t("close")}
          title=${t("close")}
          @click=${() => this.dismiss()}
        >
          ${closeIcon("ic")}
        </button>
      </div>
      <h2 id="news-title">${entry.title}</h2>
      <div class="body" id="news-body">${renderNewsBody(entry.body)}</div>
      ${entry.link || more > 0
        ? html`<div class="foot">
            ${entry.link
              ? html`<a
                  class="go"
                  href=${entry.link}
                  @click=${() => this.follow()}
                  >${entry.linkText ?? t("link")}</a
                >`
              : nothing}
            ${more > 0
              ? html`<span class="more"
                  ><span>${t("and_more", { n: more })}</span>
                  <a class="all" href="/whats-new" @click=${() => this.follow()}
                    >${t("see_all")}</a
                  ></span
                >`
              : nothing}
          </div>`
        : nothing}
    </aside>`;
  }

  static styles = css`
    :host {
      --panel: #202024;
      --panel-2: #2a2a30;
      --line: rgba(255, 255, 255, 0.09);
      --text: #f4f4f5;
      --text-2: #a1a1aa;
      --accent: #f5cc3c;
      --accent-2: #ffd447;
      --accent-ink: #2e2010;
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 75;
      width: min(380px, calc(100vw - 32px));
      font-family: "Archivo Variable", "Archivo", system-ui, sans-serif;
      color: var(--text);
      -webkit-font-smoothing: antialiased;
    }
    :host([blue]) {
      --accent: #0084d1;
      --accent-2: #1a9be6;
      --accent-ink: #fff;
    }
    * {
      box-sizing: border-box;
    }
    .card {
      position: relative;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      box-shadow:
        inset 0 3px 0 var(--accent),
        0 18px 44px rgba(0, 0, 0, 0.55);
      padding: 15px 16px 16px;
      animation: rise 0.28s ease-out;
    }
    .top {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 26px;
    }
    .kicker {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 760;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent-2);
      white-space: nowrap;
    }
    .ic {
      width: 16px;
      height: 16px;
      flex: none;
    }
    .tag {
      font-size: 12px;
      font-weight: 650;
      line-height: 18px;
      padding: 0 8px;
      border-radius: 99px;
      color: var(--tag);
      background: color-mix(in srgb, var(--tag) 13%, transparent);
      border: 1px solid color-mix(in srgb, var(--tag) 32%, transparent);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .x {
      margin: -4px -6px 0 auto;
      flex: none;
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border: 0;
      border-radius: 7px;
      background: none;
      color: var(--text-2);
      cursor: pointer;
    }
    .x .ic {
      width: 18px;
      height: 18px;
    }
    .x:hover {
      background: var(--panel-2);
      color: var(--text);
    }
    .x:focus-visible,
    a:focus-visible {
      outline: 2px solid var(--accent-2);
      outline-offset: 2px;
    }
    h2 {
      margin: 8px 0 0;
      font-size: 17px;
      font-weight: 720;
      line-height: 1.3;
      letter-spacing: -0.005em;
    }
    .body {
      margin-top: 6px;
      max-height: min(36vh, 240px);
      overflow: auto;
      font-size: 14.5px;
      line-height: 1.5;
      color: #c8c8cf;
      overflow-wrap: anywhere;
    }
    .body p,
    .body ul {
      margin: 0 0 8px;
    }
    .body > :last-child {
      margin-bottom: 0;
    }
    .body ul {
      padding-left: 18px;
    }
    .body li {
      margin: 3px 0;
    }
    .body li::marker {
      color: var(--accent);
    }
    .body strong {
      color: var(--text);
      font-weight: 700;
    }
    .foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px 14px;
      margin-top: 14px;
    }
    .go {
      display: inline-block;
      padding: 7px 14px;
      border-radius: 8px;
      background: var(--accent);
      color: var(--accent-ink);
      font-weight: 650;
      font-size: 14px;
      text-decoration: none;
      transition: background-color 0.15s;
    }
    .go:hover {
      background: var(--accent-2);
    }
    .more {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 4px 10px;
      font-size: 14px;
      color: var(--text-2);
    }
    .all {
      color: var(--text);
      font-weight: 620;
      text-decoration: underline;
      text-decoration-color: var(--accent);
      text-decoration-thickness: 2px;
      text-underline-offset: 4px;
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
    }
    @media (max-width: 560px) {
      :host {
        left: 12px;
        right: 12px;
        bottom: 12px;
        width: auto;
      }
      .card {
        padding: 13px 14px 14px;
      }
      .body {
        max-height: min(24vh, 168px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .card {
        animation: none;
      }
      .go {
        transition: none;
      }
    }
  `;
}

/** Shows a card on this page (News.ts decides when). */
export function showNewsCard(o: {
  card: NewsCard;
  text: NewsTranslate;
  blue: boolean;
  onDone: () => void;
}): DerpNewsCard {
  const el = document.createElement("derp-news-card");
  el.card = o.card;
  el.text = o.text;
  el.blue = o.blue;
  el.onDone = o.onDone;
  document.body.appendChild(el);
  return el;
}

declare global {
  interface HTMLElementTagNameMap {
    "derp-news-card": DerpNewsCard;
  }
}
