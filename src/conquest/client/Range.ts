// A slider that says what it's set to while you drag it: the value rides
// above the handle and the label beside it updates as you go. It fires
// "cq-input" as it moves and "cq-change" when you let go.

import { html, LitElement, PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

@customElement("cq-range")
export class Range extends LitElement {
  @property({ type: Number }) min = 0;
  @property({ type: Number }) max = 100;
  @property({ type: Number }) step = 1;
  @property({ type: Number }) value = 0;
  @property({ type: String }) label = "";
  @property({ type: Boolean }) disabled = false;
  /** How the value reads ("12%", "1675"). */
  @property({ attribute: false }) format: (v: number) => string = (v) =>
    String(v);
  /** A longer note beside the slider ("68 years"). */
  @property({ attribute: false }) note: ((v: number) => string) | null = null;

  @state() private live = 0;
  @state() private dragging = false;

  createRenderRoot() {
    return this;
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("value") && !this.dragging) this.live = this.value;
  }

  private onInput(e: Event): void {
    this.dragging = true;
    this.live = Number((e.target as HTMLInputElement).value);
    this.dispatchEvent(
      new CustomEvent("cq-input", { detail: this.live, bubbles: true }),
    );
  }

  private onChange(e: Event): void {
    this.dragging = false;
    this.live = Number((e.target as HTMLInputElement).value);
    this.dispatchEvent(
      new CustomEvent("cq-change", { detail: this.live, bubbles: true }),
    );
  }

  render(): TemplateResult {
    const span = Math.max(1, this.max - this.min);
    const f = (this.live - this.min) / span;
    return html`<div class="cq-range ${this.dragging ? "dragging" : ""}">
      ${this.label
        ? html`<span class="cq-range-label">${this.label}</span>`
        : ""}
      <div class="cq-range-track">
        <output
          class="cq-range-bubble"
          style=${`left: calc(${f * 100}% + ${(0.5 - f) * 18}px)`}
          >${this.format(this.live)}</output
        >
        <input
          type="range"
          min=${this.min}
          max=${this.max}
          step=${this.step}
          .value=${String(this.live)}
          ?disabled=${this.disabled}
          aria-label=${this.label || "Value"}
          aria-valuetext=${this.format(this.live)}
          @input=${(e: Event) => this.onInput(e)}
          @change=${(e: Event) => this.onChange(e)}
          @pointerup=${() => (this.dragging = false)}
        />
      </div>
      ${this.note
        ? html`<span class="cq-range-note">${this.note(this.live)}</span>`
        : ""}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cq-range": Range;
  }
}
