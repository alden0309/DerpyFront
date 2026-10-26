/**
 * DFX (r26): DerpyFront's "Watch together" button, for a saved game (a
 * profile's games, the win screen): it makes a watch room for the game and
 * goes to it, or says why it can't.
 */

import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { watchTogether } from "../../derpland/Watch";
import type { WatchCreateError } from "../../derpland/WatchTypes";
import { translateText } from "../Utils";

const ERROR_KEY: Record<WatchCreateError | "unreachable", string> = {
  invalid: "watch_together.create_no_such_game",
  no_such_game: "watch_together.create_no_such_game",
  rate_limited: "watch_together.create_rate_limited",
  too_many_rooms: "watch_together.create_too_many",
  unreachable: "watch_together.create_unreachable",
};

@customElement("derpy-watch-button")
export class DerpyWatchButton extends LitElement {
  @property({ type: String }) gameId = "";
  /** The button's classes (each place styles it its own way). */
  @property({ type: String }) buttonClass =
    "rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/20 disabled:opacity-50";
  /** Before leaving the page (the win screen leaves its game). */
  @property({ attribute: false }) beforeGo: (() => Promise<void>) | null = null;

  @state() private busy = false;
  @state() private msg = "";

  createRenderRoot() {
    return this;
  }

  private async go(): Promise<void> {
    if (this.busy || !this.gameId) return;
    this.busy = true;
    this.msg = "";
    const err = await watchTogether(this.gameId, (href) => {
      void (this.beforeGo?.() ?? Promise.resolve()).finally(() =>
        window.location.assign(href),
      );
    });
    this.busy = false;
    if (err !== null) this.msg = translateText(ERROR_KEY[err]);
  }

  render() {
    return html`<button
        type="button"
        class=${this.buttonClass}
        ?disabled=${this.busy}
        data-watch-together
        @click=${() => void this.go()}
      >
        ${translateText("watch_together.button")}
      </button>
      ${this.msg
        ? html`<span role="status" class="block text-xs text-red-300"
            >${this.msg}</span
          >`
        : nothing}`;
  }
}
