// DFSTORE (r21): the lobby's "AI personalities" picker. The host (or a Solo
// player) turns on any AI personality packs they own; the AI nations of the
// game then play the packs' personas. The choice is remembered in this
// browser for the next lobby. Packs not yet owned show as a link to the
// Derp Store.

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { translateText } from "../Utils";
import {
  DERPY_ACCOUNT_EVENT,
  derpyMe,
  derpyStore,
  DerpyStoreItem,
} from "./DerpyAccount";

const CHOICE_KEY = "derpyAiPersonalities";

/** The packs chosen last time (whatever is owned is checked again). */
export function rememberedPersonalities(): string[] {
  try {
    const v: unknown = JSON.parse(
      window.localStorage.getItem(CHOICE_KEY) ?? "[]",
    );
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function remember(packs: string[]): void {
  try {
    window.localStorage.setItem(CHOICE_KEY, JSON.stringify(packs));
  } catch {
    // storage blocked
  }
}

/** Fired with the packs now chosen (only ones the player owns). */
export class PersonalitiesChangedEvent extends CustomEvent<string[]> {
  constructor(packs: string[]) {
    super("personalities-changed", {
      detail: packs,
      bubbles: true,
      composed: true,
    });
  }
}

@customElement("ai-personality-picker")
export class AiPersonalityPicker extends LitElement {
  /** No AI nations in the game: nothing to give a personality. */
  @property({ type: Boolean }) noNations = false;

  @state() private packs: DerpyStoreItem[] = [];
  @state() private owned: string[] = [];
  @state() private chosen: string[] = [];
  @state() private loaded = false;

  createRenderRoot() {
    return this;
  }

  private onAccount = () => void this.load();

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(DERPY_ACCOUNT_EVENT, this.onAccount);
    void this.load();
  }

  disconnectedCallback(): void {
    window.removeEventListener(DERPY_ACCOUNT_EVENT, this.onAccount);
    super.disconnectedCallback();
  }

  /** The packs chosen now. */
  get selected(): string[] {
    return this.chosen;
  }

  private async load(): Promise<void> {
    try {
      const [store, me] = await Promise.all([derpyStore(), derpyMe()]);
      this.packs = (store.items ?? []).filter(
        (i) => i.category === "personalities",
      );
      this.owned = me?.owned ?? [];
    } catch {
      this.packs = [];
      this.owned = [];
    }
    this.loaded = true;
    const ownedPacks = this.packs
      .filter((p) => this.owned.includes(`pack:${p.name}`))
      .map((p) => p.name);
    this.setChosen(
      rememberedPersonalities().filter((p) => ownedPacks.includes(p)),
      false,
    );
  }

  private setChosen(packs: string[], save = true): void {
    const changed = packs.join() !== this.chosen.join();
    this.chosen = packs;
    if (save) remember(packs);
    if (changed || save)
      this.dispatchEvent(new PersonalitiesChangedEvent(packs));
  }

  private toggle(name: string): void {
    const on = this.chosen.includes(name);
    // Kept in store order, so the lobby's config reads the same every time.
    const next = this.packs
      .map((p) => p.name)
      .filter((n) => (n === name ? !on : this.chosen.includes(n)));
    this.setChosen(next);
  }

  render(): TemplateResult | typeof nothing {
    if (!this.loaded || this.packs.length === 0) return nothing;
    const mine = this.packs.filter((p) =>
      this.owned.includes(`pack:${p.name}`),
    );
    return html`<section
      class="mt-10 flex flex-col gap-3"
      data-ai-personalities
      aria-label=${translateText("ai_personalities.title")}
    >
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3
          class="m-0 text-sm font-bold uppercase tracking-wider text-white/80"
        >
          ${translateText("ai_personalities.title")}
        </h3>
        <a
          class="text-xs font-bold text-cyber-yellow underline"
          href="/store#derpyfront/personalities"
          target="_blank"
          rel="noopener"
          >${translateText("ai_personalities.get_more")}</a
        >
      </div>
      <p class="m-0 text-sm text-white/55">
        ${this.noNations
          ? translateText("ai_personalities.no_nations")
          : mine.length === 0
            ? translateText("ai_personalities.none_owned")
            : this.chosen.length === 0
              ? translateText("ai_personalities.off")
              : translateText("ai_personalities.on")}
      </p>
      <div class="flex flex-wrap gap-2 ${this.noNations ? "opacity-50" : ""}">
        ${this.packs.map((p) => {
          const owns = this.owned.includes(`pack:${p.name}`);
          const on = owns && this.chosen.includes(p.name);
          return html`<button
            class="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition-colors ${on
              ? "border-cyber-yellow bg-cyber-yellow/15 text-white"
              : owns
                ? "border-white/15 bg-white/5 text-white/80 hover:border-white/35"
                : "cursor-not-allowed border-white/5 bg-black/20 text-white/35"}"
            aria-pressed=${on}
            ?disabled=${!owns || this.noNations}
            title=${owns ? "" : translateText("ai_personalities.locked")}
            @click=${() => this.toggle(p.name)}
          >
            <span class="flex -space-x-2" aria-hidden="true">
              ${(p.personas ?? [])
                .slice(0, 3)
                .map(
                  (x) =>
                    html`<img
                      src=${x.emblem}
                      alt=""
                      class="h-5 w-7 rounded-sm border border-black/40 object-cover"
                    />`,
                )}
            </span>
            ${translateText(`derpy.item_${p.name}`)}
            ${owns ? "" : html`<span aria-hidden="true">🔒</span>`}
          </button>`;
        })}
      </div>
    </section>`;
  }
}
