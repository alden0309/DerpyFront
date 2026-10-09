// The likeness in the register: a large live portrait beside the parts of
// a look, a category at a time (face, eyes, nose and mouth, hair, beard,
// headwear, clothes, colours, marks), each stepped through or rolled.

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  type Appearance,
  choicesFor,
  CLOTH_COLORS,
  colorsFor,
  copyLook,
  EYE_COLORS,
  type Feature,
  FEATURES,
  generateLook,
  HAIR_COLORS,
  type ItemKind,
  itemOf,
  SKIN_TONES,
  type Station,
  type Swatch,
} from "../../engine/Appearance";
import { framed, lookLikeness } from "../Portrait";

export type LookTab =
  | "face"
  | "eyes"
  | "nose"
  | "hair"
  | "beard"
  | "hat"
  | "clothes"
  | "colours"
  | "marks";

type Row =
  | { k: "feature"; f: Feature; label: string }
  | { k: "swatch"; f: "skin" | "eyeColor" | "hairColor"; label: string }
  | { k: "item"; kind: ItemKind; label: string }
  | { k: "cloth"; i: 0 | 1 | 2; label: string }
  | { k: "toggles"; kind: "extras" | "marks"; label: string };

const TABS: { id: LookTab; name: string; rows: Row[] }[] = [
  {
    id: "face",
    name: "Face",
    rows: [
      { k: "swatch", f: "skin", label: "Skin" },
      { k: "feature", f: "face", label: "Shape" },
      { k: "feature", f: "jaw", label: "Jaw" },
      { k: "feature", f: "cheeks", label: "Cheeks" },
      { k: "feature", f: "ears", label: "Ears" },
    ],
  },
  {
    id: "eyes",
    name: "Eyes",
    rows: [
      { k: "feature", f: "eyes", label: "Shape" },
      { k: "swatch", f: "eyeColor", label: "Colour" },
      { k: "feature", f: "eyeSet", label: "Set" },
      { k: "feature", f: "brows", label: "Brows" },
    ],
  },
  {
    id: "nose",
    name: "Nose & mouth",
    rows: [
      { k: "feature", f: "nose", label: "Nose" },
      { k: "feature", f: "mouth", label: "Mouth" },
    ],
  },
  {
    id: "hair",
    name: "Hair",
    rows: [
      { k: "item", kind: "hair", label: "Style" },
      { k: "swatch", f: "hairColor", label: "Colour" },
      { k: "feature", f: "greying", label: "Greys" },
    ],
  },
  {
    id: "beard",
    name: "Facial hair",
    rows: [{ k: "item", kind: "beard", label: "Beard" }],
  },
  {
    id: "hat",
    name: "Headwear",
    rows: [{ k: "item", kind: "hat", label: "On the head" }],
  },
  {
    id: "clothes",
    name: "Clothes",
    rows: [
      { k: "item", kind: "clothes", label: "Dress" },
      { k: "toggles", kind: "extras", label: "Ornaments" },
    ],
  },
  {
    id: "colours",
    name: "Colours",
    rows: [
      { k: "cloth", i: 0, label: "Main" },
      { k: "cloth", i: 1, label: "Second" },
      { k: "cloth", i: 2, label: "Trim" },
    ],
  },
  {
    id: "marks",
    name: "Marks",
    rows: [
      { k: "toggles", kind: "marks", label: "Marks" },
      { k: "feature", f: "lines", label: "Lines" },
    ],
  },
];

/** The look's fields each tab's dice roll. */
const ROLLS: Record<LookTab, (keyof Appearance)[]> = {
  face: ["skin", "face", "jaw", "cheeks", "ears"],
  eyes: ["eyes", "eyeColor", "eyeSet", "brows"],
  nose: ["nose", "mouth"],
  hair: ["hair", "hairColor", "greying"],
  beard: ["beard"],
  hat: ["hat"],
  clothes: ["clothes", "colors", "extras"],
  colours: ["colors"],
  marks: ["marks", "lines"],
};

const SWATCHES: Record<"skin" | "eyeColor" | "hairColor", Swatch[]> = {
  skin: SKIN_TONES,
  eyeColor: EYE_COLORS,
  hairColor: HAIR_COLORS,
};

const randomId = () => Math.floor(Math.random() * 1_000_000_000);

@customElement("cq-look-editor")
export class LookEditor extends LitElement {
  @property({ attribute: false }) look!: Appearance;
  @property({ attribute: false }) female = false;
  @property({ attribute: false }) age = 22;
  @property({ attribute: false }) year = 1650;
  @property({ attribute: false }) culture = "english";
  @property({ attribute: false }) native = false;
  @property({ attribute: false }) station: Station = "tradesman";
  @property({ attribute: false }) religion = "anglican";
  /** The colour of the sitter's frame ribbon. */
  @property({ attribute: false }) frame = "#7b3322";
  /** The nation's colour, behind the sitter. */
  @property({ attribute: false }) color = "#7b3322";
  @property({ attribute: false }) name = "";

  @state() tab: LookTab = "face";
  /** Seen at their age now, or in later years. */
  @state() later = 0;

  createRenderRoot() {
    return this;
  }

  private emit(look: Appearance): void {
    this.look = look;
    this.dispatchEvent(
      new CustomEvent<Appearance>("cq-look", {
        detail: look,
        bubbles: true,
      }),
    );
  }

  private patch(p: Partial<Appearance>): void {
    this.emit({ ...copyLook(this.look), ...p });
  }

  private seed(id: number) {
    return {
      id,
      culture: this.culture,
      female: this.female,
      age: this.age,
      station: this.station,
      year: this.year,
      religion: this.religion,
    };
  }

  /** Roll the dice for one tab's parts, or for everything. */
  roll(tab: LookTab | "all"): void {
    const fresh = generateLook(this.seed(randomId()));
    if (tab === "all") {
      this.emit(fresh);
      return;
    }
    const next = copyLook(this.look);
    const r = next as unknown as Record<string, unknown>;
    const f = fresh as unknown as Record<string, unknown>;
    for (const k of ROLLS[tab]) r[k] = f[k];
    if (tab === "colours")
      next.colors = colorsFor(next.clothes, this.seed(randomId()));
    this.emit(next);
  }

  private tabs(): typeof TABS {
    return TABS.filter(
      (t) => t.id !== "beard" || (!this.female && this.age >= 14),
    );
  }

  /** The age the preview shows. */
  private shownAge(): number {
    return [this.age, Math.max(this.age, 45), Math.max(this.age, 68)][
      this.later
    ];
  }

  render(): TemplateResult {
    if (!this.look) return html``;
    const tabs = this.tabs();
    if (!tabs.some((t) => t.id === this.tab)) this.tab = "face";
    const tab = tabs.find((t) => t.id === this.tab)!;
    const age = this.shownAge();
    const url = lookLikeness(this.look, {
      female: this.female,
      age,
      year: this.year + (age - this.age),
      culture: this.culture,
      native: this.native,
      color: this.color,
    });
    return html`<div class="cq-look">
      <figure class="cq-look-preview">
        <span class="cq-sitter" style="--frame:${this.frame}">
          ${framed(url, `Likeness of ${this.name}`, "huge cq-look-picture")}
        </span>
        <figcaption>
          <div
            class="cq-seg small cq-look-ages"
            role="radiogroup"
            aria-label="Seen at"
          >
            ${["Now", "At 45", "At 68"].map(
              (label, i) =>
                html`<button
                  role="radio"
                  aria-checked=${this.later === i}
                  ?disabled=${i > 0 && [45, 68][i - 1] <= this.age}
                  @click=${() => (this.later = i)}
                >
                  ${label}
                </button>`,
            )}
          </div>
          <button
            class="cq-btn quiet small cq-look-roll-all"
            @click=${() => this.roll("all")}
          >
            Roll the whole likeness
          </button>
        </figcaption>
      </figure>
      <div class="cq-look-parts">
        <div
          class="cq-look-tabs"
          role="tablist"
          aria-label="Parts of the likeness"
        >
          ${tabs.map(
            (t) =>
              html`<button
                role="tab"
                class="cq-look-tab"
                data-tab=${t.id}
                aria-selected=${t.id === this.tab}
                @click=${() => (this.tab = t.id)}
              >
                ${t.name}
              </button>`,
          )}
        </div>
        <div class="cq-look-panel" role="tabpanel" aria-label=${tab.name}>
          ${tab.rows.map((r) => this.row(r))}
          <div class="cq-look-panel-foot">
            <button
              class="cq-btn quiet small cq-look-roll"
              @click=${() => this.roll(tab.id)}
            >
              Roll the ${tab.name.toLowerCase()}
            </button>
          </div>
        </div>
      </div>
    </div>`;
  }

  private row(r: Row): TemplateResult {
    switch (r.k) {
      case "feature": {
        const names = FEATURES[r.f] as readonly string[];
        const v = this.look[r.f] as number;
        return this.stepper(
          r.label,
          names[v] ?? "",
          (by) => this.patch({ [r.f]: (v + by + names.length) % names.length }),
          r.f,
        );
      }
      case "swatch": {
        const list = SWATCHES[r.f];
        const v = this.look[r.f];
        return this.swatches(r.label, list, v, (i) => this.patch({ [r.f]: i }));
      }
      case "item": {
        const list = choicesFor(r.kind, {
          female: this.female,
          native: this.native,
          year: this.year,
        });
        const cur = this.look[r.kind];
        if (!list.some((i) => i.key === cur)) {
          const own = itemOf(r.kind, cur);
          if (own) list.unshift(own);
        }
        const i = Math.max(
          0,
          list.findIndex((x) => x.key === cur),
        );
        return this.stepper(
          r.label,
          list[i]?.name ?? "",
          (by) => {
            const next = list[(i + by + list.length) % list.length];
            if (!next) return;
            const p: Partial<Appearance> = { [r.kind]: next.key };
            // New clothes come in their own colours.
            if (r.kind === "clothes")
              p.colors = colorsFor(next.key, this.seed(randomId()));
            this.patch(p);
          },
          r.kind,
          `${i + 1} of ${list.length}`,
        );
      }
      case "cloth": {
        const v = this.look.colors[r.i];
        return this.swatches(r.label, CLOTH_COLORS, v, (c) => {
          const colors = [...this.look.colors] as Appearance["colors"];
          colors[r.i] = c;
          this.patch({ colors });
        });
      }
      case "toggles": {
        const list = choicesFor(r.kind, {
          female: this.female,
          native: this.native,
          year: this.year,
        });
        const on = this.look[r.kind];
        return html`<div class="cq-look-row toggles">
          <span class="cq-field-label">${r.label}</span>
          <div class="cq-look-toggles">
            ${list.map(
              (i) =>
                html`<button
                  class="cq-look-toggle"
                  aria-pressed=${on.includes(i.key)}
                  @click=${() =>
                    this.patch({
                      [r.kind]: on.includes(i.key)
                        ? on.filter((x) => x !== i.key)
                        : [...on, i.key],
                    })}
                >
                  ${i.name}
                </button>`,
            )}
          </div>
        </div>`;
      }
    }
  }

  private stepper(
    label: string,
    value: string,
    step: (by: number) => void,
    key: string,
    count?: string,
  ): TemplateResult {
    return html`<div class="cq-look-row" data-part=${key}>
      <span class="cq-field-label">${label}</span>
      <div class="cq-look-step">
        <button
          class="cq-step-btn"
          aria-label=${`Previous ${label.toLowerCase()}`}
          @click=${() => step(-1)}
        >
          ‹
        </button>
        <span class="cq-look-value"
          >${value}${count
            ? html`<small class="cq-muted"> ${count}</small>`
            : nothing}</span
        >
        <button
          class="cq-step-btn"
          aria-label=${`Next ${label.toLowerCase()}`}
          @click=${() => step(1)}
        >
          ›
        </button>
      </div>
    </div>`;
  }

  private swatches(
    label: string,
    list: Swatch[],
    value: number,
    pick: (i: number) => void,
  ): TemplateResult {
    return html`<div class="cq-look-row swatches">
      <span class="cq-field-label">${label}</span>
      <div class="cq-swatches-pick" role="radiogroup" aria-label=${label}>
        ${list.map(
          (sw, i) =>
            html`<button
              role="radio"
              aria-checked=${value === i}
              title=${sw.name}
              aria-label=${sw.name}
              style="--sw:${sw.hex}"
              @click=${() => pick(i)}
            ></button>`,
        )}
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cq-look-editor": LookEditor;
  }
}
