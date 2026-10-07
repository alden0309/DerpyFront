import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import "./CosmeticBackground";

@customElement("play-page")
export class PlayPage extends LitElement {
  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <div
        id="page-play"
        class="flex flex-col gap-2 w-full px-0 lg:px-4 min-h-0"
      >
        <token-login class="absolute"></token-login>
        <rewards-modal class="absolute"></rewards-modal>

        <!-- Derpy Front: the name (with its clan tag) and the play buttons,
             nothing else. -->
        <div
          class="w-full pb-4 lg:pb-0 flex flex-col gap-4 sm:-mx-4 sm:w-[calc(100%+2rem)] lg:mx-0 lg:w-full"
        >
          <!-- Identity row: username over the currently selected cosmetic background. -->
          <div
            class="relative bg-surface border-y border-white/10 overflow-visible flex items-center sm:min-h-[60px] sm:z-20 sm:border-y-0 sm:rounded-xl"
          >
            <!-- Selected skin/pattern fills the bubble like the player's territory in game. -->
            <cosmetic-background
              class="absolute inset-0 z-0 overflow-hidden sm:rounded-xl pointer-events-none"
            ></cosmetic-background>
            <div
              class="relative z-10 flex h-full w-full min-w-0 items-center bg-surface/80 p-1 sm:rounded-xl"
            >
              <username-input
                class="flex-1 min-w-0 h-10 sm:h-[50px]"
              ></username-input>
            </div>
          </div>
        </div>

        <game-mode-selector></game-mode-selector>
      </div>
    `;
  }
}
