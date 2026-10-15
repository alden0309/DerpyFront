// Before chapter one (r21): who was he at the Agency? Pick one of the
// chapter's archetypes, or share out the points yourself and choose the
// skill he's known for. The archetypes, attributes and skills come from the
// chapter's script; this screen only lays them out.
//
// r22: and which languages he speaks, besides his own American English: as
// many as his Languages skill allows (at least one), as well as it says.

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  buildOf,
  buildProblem,
  defaultBuild,
  fluency,
  LANGUAGES_SKILL,
  languageSlots,
  skillValues,
} from "../engine/Skills";
import { Build, Chapter } from "../engine/Types";

const COLORS = ["#e0715a", "#7fb2e5", "#d9b45a", "#b98be0"];

@customElement("based-setup")
export class BasedSetup extends LitElement {
  @property({ attribute: false }) chapter!: Chapter;
  @property({ attribute: false }) done: (b: Build) => void = () => {};
  @property({ attribute: false }) back: () => void = () => {};
  @state() private pick = "";
  @state() private own: Build | null = null;
  /** The languages picked (null: as many as he can, in the order written). */
  @state() private langs: string[] | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.pick = this.chapter.archetypes[0]?.id ?? "OWN";
  }

  private get build(): Build {
    const base =
      this.pick === "OWN"
        ? (this.own ?? this.startOwn())
        : (() => {
            const a = this.chapter.archetypes.find((x) => x.id === this.pick);
            return a ? buildOf(a) : defaultBuild(this.chapter);
          })();
    return { ...base, langs: this.langsFor(base) };
  }

  /** His languages under a build: those picked, as many as he may have. */
  private langsFor(b: Build): string[] {
    const all = this.chapter.languages;
    if (all.length === 0) return [];
    const slots = languageSlots(
      skillValues(this.chapter, b)[LANGUAGES_SKILL] ?? 0,
      all.length,
    );
    const picked = (this.langs ?? []).filter((c) =>
      all.some((l) => l.code === c),
    );
    if (picked.length > 0) return picked.slice(0, slots);
    return all.slice(0, slots).map((l) => l.code);
  }

  private toggleLang(code: string, b: Build): void {
    const all = this.chapter.languages;
    const slots = languageSlots(
      skillValues(this.chapter, b)[LANGUAGES_SKILL] ?? 0,
      all.length,
    );
    const cur = b.langs ?? [];
    if (cur.includes(code)) {
      if (cur.length > 1) this.langs = cur.filter((c) => c !== code);
    } else if (cur.length < slots) {
      this.langs = [...cur, code];
    } else {
      // Full: the newest pick takes the place of the oldest.
      this.langs = [...cur.slice(1), code];
    }
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
        <div class="mb-early">Before Paris</div>
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
      ${c.languages.length > 0 ? this.renderLangs(b, values) : nothing}
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
          <small>${this.chapter.summary}</small>
        </button>
      </div>
    </main>`;
  }

  private renderLangs(
    b: Build,
    values: Record<string, number>,
  ): TemplateResult {
    const skill = values[LANGUAGES_SKILL] ?? 0;
    const slots = languageSlots(skill, this.chapter.languages.length);
    const name = this.chapter.skills.find(
      (x) => x.id === LANGUAGES_SKILL,
    )?.name;
    return html`<section class="mb-langs">
      <div class="mb-panel-sub">Languages</div>
      <p class="mb-p">
        American English, of course. Besides that, his ${name ?? "Languages"}
        (${skill}) gives him
        ${slots === 1 ? "one other language" : `${slots} others`}, spoken
        ${fluency(skill)}. Someone talking in one he doesn't speak shows as they
        said it; now and then his ${name ?? "Languages"} still gets the gist.
      </p>
      <div class="mb-segs">
        ${this.chapter.languages.map(
          (l) =>
            html`<button
              class="mb-seg ${b.langs?.includes(l.code) ? "on" : ""}"
              aria-pressed=${!!b.langs?.includes(l.code)}
              @click=${() => this.toggleLang(l.code, b)}
            >
              ${l.name}
            </button>`,
        )}
      </div>
    </section>`;
  }
}
