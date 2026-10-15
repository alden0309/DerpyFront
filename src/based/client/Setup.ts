// Before chapter one (r21): who was he at the Agency? Pick one of the
// chapter's archetypes, or share out the points yourself and choose the
// skill he's known for. The archetypes, attributes and skills come from the
// chapter's script; this screen only lays them out.
//
// r22 BPLAY: and what he speaks besides his own American English: his
// Languages skill is a pool of points, spent here under Languages on each
// of the chapter's languages (0 to 3: he doesn't speak it, gets by, fluent,
// like a native).

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  buildOf,
  buildProblem,
  defaultBuild,
  LANG_MAX,
  langLevel,
  langSpent,
  languagePool,
  LANGUAGES_SKILL,
  skillValues,
} from "../engine/Skills";
import { Build, Chapter } from "../engine/Types";

import { voice } from "./Ui";

@customElement("based-setup")
export class BasedSetup extends LitElement {
  @property({ attribute: false }) chapter!: Chapter;
  @property({ attribute: false }) done: (b: Build) => void = () => {};
  @property({ attribute: false }) back: () => void = () => {};
  @state() private pick = "";
  @state() private own: Build | null = null;
  /** Language points as the player spent them (r22 BPLAY); none to start. */
  @state() private langPts: Record<string, number> = {};

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
    return { ...base, langPts: this.ptsFor(base) };
  }

  /**
   * The points spent, as far as this build's pool goes: a smaller pool (a
   * different archetype, an attribute taken down) takes them back from the
   * last languages first.
   */
  private ptsFor(b: Build): Record<string, number> {
    let left = languagePool(this.chapter, b);
    const out: Record<string, number> = {};
    for (const l of this.chapter.languages) {
      const n = Math.min(this.langPts[l.code] ?? 0, LANG_MAX, left);
      if (n > 0) out[l.code] = n;
      left -= n;
    }
    return out;
  }

  private bumpLang(code: string, d: number, b: Build): void {
    const cur = b.langPts ?? {};
    const v = (cur[code] ?? 0) + d;
    if (v < 0 || v > LANG_MAX) return;
    if (d > 0 && langSpent(b) >= languagePool(this.chapter, b)) return;
    this.langPts = { ...cur, [code]: v };
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
              ${this.pick === a.id
                ? html`<span class="mb-arch-stamp" aria-hidden="true"
                    >Assigned</span
                  >`
                : nothing}
              <div class="mb-arch-name">${a.name}</div>
              <div class="mb-arch-about">${a.about}</div>
              <div class="mb-arch-attrs">
                ${c.attributes.map(
                  (x, i) =>
                    html`<span style="--c:${voice(i).paper}"
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
          ${this.pick === "OWN"
            ? html`<span class="mb-arch-stamp" aria-hidden="true"
                >Assigned</span
              >`
            : nothing}
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
                style="--c:${voice(i).night};--ci:${voice(i).paper}"
              >
                <div class="mb-attr-head">
                  <span class="mb-attr-name">${a.name}</span>
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
                        </label>
                        ${s.id === LANGUAGES_SKILL && c.languages.length > 0
                          ? this.renderLangs(b)
                          : nothing}`,
                  )}
              </section>`,
          )}
        </div>
      </section>
      <div class="mb-setup-go">
        ${problem
          ? html`<span class="mb-setup-problem" role="status">${problem}</span>`
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

  /** His language points, under Languages in its attribute (r22 BPLAY). */
  private renderLangs(b: Build): TemplateResult {
    const pool = languagePool(this.chapter, b);
    const left = pool - langSpent(b);
    const pts = b.langPts ?? {};
    return html`<div class="mb-lang-pts" role="group" aria-label="Languages">
      <div class="mb-lang-left">
        ${left === 0
          ? `${pool} language point${pool === 1 ? "" : "s"}, all spent`
          : `${left} of ${pool} language point${pool === 1 ? "" : "s"} to spend`}
      </div>
      ${this.chapter.languages.map((l) => {
        const n = pts[l.code] ?? 0;
        return html`<div class="mb-lang-row ${n > 0 ? "on" : ""}">
          <span class="mb-lang-what">
            <span class="mb-lang-name">${l.name}</span>
            <span class="mb-lang-level">${langLevel(n)}</span>
          </span>
          <span class="mb-stepper small">
            <button
              aria-label="Less ${l.name}"
              ?disabled=${n === 0}
              @click=${() => this.bumpLang(l.code, -1, b)}
            >
              −
            </button>
            <span
              class="mb-lang-pips"
              role="img"
              aria-label="${n} of ${LANG_MAX}"
              >${Array.from(
                { length: LANG_MAX },
                (_, i) => html`<i class=${i < n ? "on" : ""}></i>`,
              )}</span
            >
            <button
              aria-label="More ${l.name}"
              ?disabled=${n >= LANG_MAX || left === 0}
              @click=${() => this.bumpLang(l.code, 1, b)}
            >
              +
            </button>
          </span>
        </div>`;
      })}
      <p class="mb-lang-note">
        Besides his American English. A language he doesn't speak shows as it
        was said, though his Languages may still catch the gist; the more
        points, the more he follows and the easier its checks.
      </p>
    </div>`;
  }
}
