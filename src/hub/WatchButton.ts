// DFX (r26): "Watch together" on Derp Land's lists of finished DerpyFront
// games (a profile's games, your friends' recent games): it makes a watch
// room for the game and goes to it, or says why it can't.

import { html, LitElement, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { WATCH_CREATE_TEXT, watchTogether } from "../derpland/Watch";

/** Two people and an eye: watching together. */
export function watchTogetherIcon(cls = "dl-i"): TemplateResult {
  return html`<svg
    class=${cls}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M4 21.5c.7-1.6 2-2.5 3.5-2.5M20 21.5c-.7-1.6-2-2.5-3.5-2.5" />
  </svg>`;
}

@customElement("dl-watch-button")
export class DerpWatchButton extends LitElement {
  @property({ type: String }) gameId = "";
  @state() private busy = false;
  @state() private msg = "";
  private timer: ReturnType<typeof setTimeout> | null = null;

  createRenderRoot() {
    return this;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.timer !== null) clearTimeout(this.timer);
  }

  private async go(): Promise<void> {
    if (this.busy || !this.gameId) return;
    this.busy = true;
    const err = await watchTogether(this.gameId);
    this.busy = false;
    if (err === null) return;
    this.msg = WATCH_CREATE_TEXT[err];
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => (this.msg = ""), 4000);
  }

  render() {
    return html`<button
        type="button"
        class="dl-btn small ghost"
        ?disabled=${this.busy}
        title="Watch this game's replay with friends, in sync"
        @click=${() => void this.go()}
      >
        ${watchTogetherIcon()} Watch together
      </button>
      ${this.msg
        ? html`<span class="dl-watch-msg" role="status">${this.msg}</span>`
        : ""}`;
  }
}
