// Before chapter one (r21): who was he at the Agency? Pick one of the
// chapter's archetypes, or share out the points yourself and choose the
// skill he's known for. The archetypes, attributes and skills come from the
// chapter's script; this screen only lays them out.

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  buildOf,
  buildProblem,
  defaultBuild,
  skillValues,
} from "../engine/Skills";
import { Build, Chapter } from "../engine/Types";

const COLORS = ["#7fb2e5", "#e0715a", "#b98be0", "#d9b45a"];

@customElement("based-setup")
export class BasedSetup extends LitElement {
  @property({ attribute: false }) chapter!: Chapter;
  @property({ attribute: false }) done: (b: Build) => void = () => {};
  @property({ attribute: false }) back: () => void = () => {};
  @state() private pick = "";
  @state() private own: Build | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.pick = this.chapter.archetypes[0]?.id ?? "OWN";
  }

  private get build(): Build {
    if (this.pick === "OWN") return this.own ?? this.startOwn();
    const a = this.chapter.archetypes.find((x) => x.id === this.pick);
    return a ? buildOf(a) : defaultBuild(this.chapter);
  }

  private startOwn(): Build {
    const b = { ...defaultBuild(this.chapter) };
    b.attrs = { ...b.attrs };
    delete b.archetype;
    this.own = b;
    return b;
  }

  private bump(attr: string, d: number): void {
    const b = this.own ?? this.startOwn();
    const r = this.chapter.points;
    const v = (b.attrs[attr] ?? 0) + d;
    const sum = Object.values(b.attrs).reduce((x, y) => x + y, 0) + d;
    if (v < r.min || v > r.max || sum > r.total) return;
    this.own = { ...b, attrs: { ...b.attrs, [attr]: v } };
  }

  render(): TemplateResult {
    const c = this.chapter;
    const b = this.build;
    const values = skillValues(c, b);
    const used = Object.values(b.attrs).reduce((x, y) => x + y, 0);
    const problem = buildProblem(c, b);
    return html`<main class="mb-setup">
      <button class="mb-back" @click=${() => this.back()}>← Mr. Based</button>
      <div class="mb-setup-head">
        <div class="mb-early">Before the first glass</div>
        <h1 class="mb-h1">What was he, at the Agency?</h1>
        <p class="mb-p">
          Seventeen years shape a man. Choose what they made of him; his skills
          will speak up in his head, and the dice will lean his way where he's
          strong.
        </p>
      </div>
      <div class="mb-archetypes">
        ${c.archetypes.map(
          (a) =>
            html`<button
              class="mb-arch ${this.pick === a.id ? "on" : ""}"
              aria-pressed=${this.pick === a.id}
              @click=${() => (this.pick = a.id)}
            >
              <div class="mb-arch-name">${a.name}</div>
              <div class="mb-arch-about">${a.about}</div>
              <div class="mb-arch-attrs">
                ${c.attributes.map(
                  (x, i) =>
                    html`<span style="--c:${COLORS[i % COLORS.length]}"
                      ><b>${a.attrs[x.id]}</b> ${x.name}</span
                    >`,
                )}
              </div>
              <div class="mb-arch-sig">
                Known for his
                ${c.skills.find((s) => s.id === a.signature)?.name ?? ""}
              </div>
            </button>`,
        )}
        <button
          class="mb-arch own ${this.pick === "OWN" ? "on" : ""}"
          aria-pressed=${this.pick === "OWN"}
          @click=${() => {
            this.pick = "OWN";
            if (!this.own) this.startOwn();
          }}
        >
          <div class="mb-arch-name">His own man</div>
          <div class="mb-arch-about">
            Share out ${c.points.total} points across his attributes
            (${c.points.min} to ${c.points.max} each) and pick the skill he's
            known for.
          </div>
        </button>
      </div>
      <section class="mb-build">
        ${this.pick === "OWN"
          ? html`<div class="mb-points">
              ${c.points.total - used} of ${c.points.total} points left
            </div>`
          : nothing}
        <div class="mb-skills">
          ${c.attributes.map(
            (a, i) =>
              html`<section
                class="mb-attr"
                style="--c:${COLORS[i % COLORS.length]}"
              >
                <div class="mb-attr-head">
                  <b>${a.name.toUpperCase()}</b>
                  ${this.pick === "OWN"
                    ? html`<span class="mb-stepper">
                        <button
                          aria-label="Less ${a.name}"
                          @click=${() => this.bump(a.id, -1)}
                        >
                          −
                        </button>
                        <span class="mb-attr-val">${b.attrs[a.id] ?? 0}</span>
                        <button
                          aria-label="More ${a.name}"
                          @click=${() => this.bump(a.id, 1)}
                        >
                          +
                        </button>
                      </span>`
                    : html`<span class="mb-attr-val"
                        >${b.attrs[a.id] ?? 0}</span
                      >`}
                </div>
                <p class="mb-attr-about">${a.about}</p>
                ${c.skills
                  .filter((s) => s.attr === a.id)
                  .map(
                    (s) =>
                      html`<label
                        class="mb-skill ${b.signature === s.id ? "sig" : ""}"
                      >
                        ${this.pick === "OWN"
                          ? html`<input
                              type="radio"
                              name="sig"
                              .checked=${b.signature === s.id}
                              @change=${() =>
                                (this.own = { ...b, signature: s.id })}
                            />`
                          : nothing}
                        <span class="mb-skill-name"
                          >${s.name}${b.signature === s.id
                            ? html` <span class="mb-sig">signature</span>`
                            : nothing}</span
                        >
                        <span class="mb-skill-val">${values[s.id] ?? 0}</span>
                        <span class="mb-skill-about">${s.about}</span>
                      </label>`,
                  )}
              </section>`,
          )}
        </div>
      </section>
      <div class="mb-setup-go">
        ${problem && this.pick === "OWN"
          ? html`<span class="mb-setup-problem">${problem}</span>`
          : nothing}
        <button
          class="mb-btn primary big"
          ?disabled=${problem !== null}
          @click=${() => this.done(this.build)}
        >
          Begin
          <small>Chapter ${this.chapter.n}: ${this.chapter.title}</small>
        </button>
      </div>
    </main>`;
  }
}
