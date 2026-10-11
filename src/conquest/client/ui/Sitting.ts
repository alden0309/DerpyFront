// Sitting for a new likeness in the game: the register's gallery in a
// window, to choose an older face at fifty, a grown one at sixteen (a child
// of the family), or just another, and tune it. Free, and as often as you like.

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  ageBand,
  copyLook,
  type Look,
  plainLook,
  sitterAt,
  stationOfBackground,
} from "../../engine/Appearance";
import { dateOf } from "../../engine/Calendar";
import { lifeIsNative } from "../../engine/LifeQueries";
import { ageOf } from "../../engine/Queries";
import type { Character } from "../../engine/Types";
import "../Likeness";
import type { GameUi } from "./Context";

/** The look someone sits with: their own, or the picture they're shown with now. */
function startingLook(ui: GameUi, me: Character): Look {
  const age = ageOf(ui.s, me);
  const now = sitterAt(me.look ?? plainLook(""), age, me);
  const l: Look = me.look ? copyLook(me.look) : { ...plainLook(""), grey: 1 };
  // A child of the family grown (or still a child) who hasn't chosen: start from the face given them.
  if (age >= 16 && !l.p) l.p = now.id;
  if (age < 16 && !l.kid) l.kid = now.id;
  return l;
}

/** Whether to suggest a new sitting: grown without a chosen face, or fifty and still painted young. */
export function sittingDue(ui: GameUi): "grown" | "older" | null {
  const me = ui.me;
  if (!me?.look || !ui.life) return null;
  const age = ageOf(ui.s, me);
  if (age >= 16 && age < 22 && !me.look.p) return "grown";
  const s = sitterAt(me.look, age, me);
  const band = ageBand(age);
  if (
    age >= 50 &&
    (band === "middle" || band === "elder") &&
    (s.age === "youth" || s.age === "prime")
  )
    return "older";
  return null;
}

/** A word on the sheet when a sitting is due, or a quiet button. */
export function sittingPrompt(ui: GameUi): TemplateResult {
  const due = sittingDue(ui);
  const open = () => ui.modal({ k: "likeness" });
  if (due)
    return html`<p class="cq-lk-nudge">
      ${due === "grown"
        ? "Grown now: the family's painter asks how you'd be shown."
        : "Fifty years and more: your likeness could show them."}
      <button class="cq-btn small" @click=${open}>Sit for a likeness</button>
    </p>`;
  return html`<button class="cq-link small cq-lk-resit" @click=${open}>
    Sit for a new likeness
  </button>`;
}

@customElement("cq-sitting")
export class Sitting extends LitElement {
  @property({ attribute: false }) ui!: GameUi;
  @state() private draft: Look | null = null;
  @state() private busy = false;

  createRenderRoot() {
    return this;
  }

  private async sit(): Promise<void> {
    if (!this.draft || this.busy) return;
    this.busy = true;
    const ok = await this.ui.cmd({ k: "likeness", look: this.draft });
    this.busy = false;
    if (ok) {
      this.ui.toast("Your new likeness hangs in the hall.", "good");
      this.ui.modal(null);
    }
  }

  render(): TemplateResult {
    const ui = this.ui;
    const me = ui.me;
    const life = ui.life;
    if (!me || !life) return html``;
    this.draft ??= startingLook(ui, me);
    const age = ageOf(ui.s, me);
    const child = age < 16;
    return html`<div class="cq-lk-sitting">
      <h2 class="cq-h2">Sit for a likeness</h2>
      <p class="cq-muted">
        Choose the face nearest your own, as you are
        now${child ? "" : ", and how your hair and clothes should look"}.
        ${child
          ? "When you're grown you'll sit again."
          : "Your hair greys with the years as you choose here."}
      </p>
      <cq-likeness
        .look=${this.draft}
        .female=${me.female}
        .age=${age}
        .culture=${me.culture}
        .native=${lifeIsNative(ui.s, life)}
        .station=${stationOfBackground(life.background)}
        .year=${dateOf(ui.s.day).year}
        .frame=${life.frame}
        .name=${me.first}
        .child=${child}
        @cq-look=${(e: CustomEvent<Look>) => (this.draft = e.detail)}
      ></cq-likeness>
      <div class="cq-lk-sitting-foot">
        <button class="cq-btn quiet" @click=${() => ui.modal(null)}>
          Keep my likeness
        </button>
        <button
          class="cq-btn primary"
          ?disabled=${this.busy}
          @click=${() => void this.sit()}
        >
          ${this.busy ? "Sitting…" : "Sit for this likeness"}
        </button>
      </div>
      ${nothing}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cq-sitting": Sitting;
  }
}

/** The modal's body. */
export function sittingPage(ui: GameUi): TemplateResult {
  return html`<cq-sitting .ui=${ui}></cq-sitting>`;
}
