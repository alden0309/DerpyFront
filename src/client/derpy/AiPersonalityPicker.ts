// The lobby's "AI personalities" picker (DFSTORE r21; AIP r23 made it the
// four personalities). The host (or a Solo player) ticks which are in play:
// Normal, free and ticked by default, and any of Mad Scientist, Trader,
// Aggressive and Protector they own. One, several or all, but always at
// least one. Each AI nation is then dealt one of the ticked options at
// random. Personalities not yet owned show locked, with a link to the Derp
// Store. The choice is remembered in this browser for the next game.

import {
  AI_CHOICES,
  AI_TYPES,
  AiChoice,
  aiChoices,
  aiTypeItem,
  NORMAL_AI,
} from "@openfront/engine-lib/game/AiPersonalityTypes";
import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { translateText } from "../Utils";
import {
  AI_CHOICE_BADGE,
  AI_CHOICE_ICON,
  aiChoiceHint,
  aiChoiceName,
} from "./AiPersonalityLabels";
import { DERPY_ACCOUNT_EVENT, derpyMe, derpyStore } from "./DerpyAccount";

// r21's key held pack ids; the personalities have a key of their own.
const CHOICE_KEY = "derpyAiPersonalities.v2";

/** The options ticked last time in this browser (unchecked against ownership). */
export function rememberedPersonalities(): AiChoice[] {
  try {
    const v: unknown = JSON.parse(
      window.localStorage.getItem(CHOICE_KEY) ?? "null",
    );
    return Array.isArray(v)
      ? aiChoices(v.filter((x): x is string => typeof x === "string"))
      : [];
  } catch {
    return [];
  }
}

function remember(choices: readonly AiChoice[]): void {
  try {
    window.localStorage.setItem(CHOICE_KEY, JSON.stringify(choices));
  } catch {
    // storage blocked
  }
}

/** The personalities an account's owned rows let it tick (Normal is free). */
export function ownedChoices(owned: readonly string[]): AiChoice[] {
  return [
    NORMAL_AI,
    ...AI_TYPES.filter((t) => owned.includes(`pack:${aiTypeItem(t)}`)),
  ];
}

/**
 * What to tick when the picker opens: what was ticked last time, of what the
 * player may tick now, or Normal if that leaves nothing.
 */
export function initialChoices(
  remembered: readonly AiChoice[],
  allowed: readonly AiChoice[],
): AiChoice[] {
  const kept = aiChoices(remembered.filter((c) => allowed.includes(c)));
  return kept.length > 0 ? kept : [NORMAL_AI];
}

/**
 * Ticking or unticking `choice`: the options ticked after, in their fixed
 * order. The last ticked option can't be unticked, and a locked one can't be
 * ticked.
 */
export function toggledChoices(
  chosen: readonly AiChoice[],
  choice: AiChoice,
  allowed: readonly AiChoice[],
): AiChoice[] {
  const on = chosen.includes(choice);
  if (on && chosen.length === 1) return [...chosen];
  if (!on && !allowed.includes(choice)) return [...chosen];
  return AI_CHOICES.filter((c) => (c === choice ? !on : chosen.includes(c)));
}

/** Fired with the options now ticked (only ones the player may tick). */
export class PersonalitiesChangedEvent extends CustomEvent<AiChoice[]> {
  constructor(choices: AiChoice[]) {
    super("personalities-changed", {
      detail: choices,
      bubbles: true,
      composed: true,
    });
  }
}

@customElement("ai-personality-picker")
export class AiPersonalityPicker extends LitElement {
  /** No AI nations in the game: nothing to give a personality. */
  @property({ type: Boolean }) noNations = false;

  @state() private allowed: AiChoice[] = [NORMAL_AI];
  @state() private chosen: AiChoice[] = [NORMAL_AI];
  @state() private loaded = false;
  @state() private storeOpen = false;
  @state() private nudge = false;

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

  /** The options ticked now. */
  get selected(): AiChoice[] {
    return this.chosen;
  }

  private async load(): Promise<void> {
    let owned: string[] = [];
    try {
      const [store, me] = await Promise.all([derpyStore(), derpyMe()]);
      this.storeOpen = (store.items ?? []).some(
        (i) => i.category === "personalities",
      );
      owned = me?.owned ?? [];
    } catch {
      this.storeOpen = false;
    }
    this.loaded = true;
    this.allowed = ownedChoices(owned);
    this.setChosen(
      initialChoices(rememberedPersonalities(), this.allowed),
      false,
    );
  }

  private setChosen(choices: AiChoice[], save = true): void {
    const changed = choices.join() !== this.chosen.join();
    this.chosen = choices;
    if (save) remember(choices);
    if (changed || save) {
      this.dispatchEvent(new PersonalitiesChangedEvent(choices));
    }
  }

  private toggle(choice: AiChoice): void {
    const next = toggledChoices(this.chosen, choice, this.allowed);
    this.nudge = next.join() === this.chosen.join() && next.includes(choice);
    if (!this.nudge) this.setChosen(next);
  }

  render(): TemplateResult | typeof nothing {
    if (!this.loaded || !this.storeOpen) return nothing;
    const off = this.noNations;
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
        ${off
          ? translateText("ai_personalities.no_nations")
          : this.nudge
            ? translateText("ai_personalities.keep_one")
            : translateText("ai_personalities.dealt")}
      </p>
      <div
        class="grid grid-cols-2 gap-2 sm:grid-cols-3 ${off ? "opacity-50" : ""}"
        role="group"
      >
        ${AI_CHOICES.map((c) => this.renderChoice(c, off))}
      </div>
    </section>`;
  }

  private renderChoice(choice: AiChoice, off: boolean): TemplateResult {
    const owns = this.allowed.includes(choice);
    const on = this.chosen.includes(choice);
    const hint = aiChoiceHint(choice);
    const body = html`<span class="text-lg leading-none" aria-hidden="true"
        >${AI_CHOICE_ICON[choice]}</span
      >
      <span class="flex min-w-0 flex-1 flex-col items-start">
        <span class="max-w-full truncate">${aiChoiceName(choice)}</span>
        <span
          class="max-w-full truncate text-[11px] font-semibold text-white/45"
        >
          ${choice === NORMAL_AI
            ? translateText("ai_personalities.free")
            : owns
              ? on
                ? translateText("ai_personalities.in_play")
                : translateText("ai_personalities.not_in_play")
              : translateText("ai_personalities.locked_short")}
        </span>
      </span>`;
    if (!owns) {
      return html`<a
        class="flex min-w-0 items-center gap-2 rounded-xl border border-white/5 bg-black/20 px-3 py-2 text-sm font-bold text-white/40 no-underline hover:border-white/20 hover:text-white/60"
        href="/store#derpyfront/personalities"
        target="_blank"
        rel="noopener"
        data-choice=${choice}
        data-locked
        title=${`${hint} ${translateText("ai_personalities.locked")}`}
        >${body}<span class="ml-auto" aria-hidden="true">🔒</span></a
      >`;
    }
    return html`<button
      class="flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-bold transition-colors ${on
        ? `${AI_CHOICE_BADGE[choice]} ring-1 ring-inset ring-white/10`
        : "border-white/15 bg-white/5 text-white/70 hover:border-white/35"}"
      role="checkbox"
      aria-checked=${on}
      ?disabled=${off}
      data-choice=${choice}
      title=${hint}
      @click=${() => this.toggle(choice)}
    >
      ${body}
      <span
        class="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[11px] ${on
          ? "border-cyber-yellow bg-cyber-yellow text-zinc-900"
          : "border-white/30"}"
        aria-hidden="true"
        >${on ? "✓" : ""}</span
      >
    </button>`;
  }
}
