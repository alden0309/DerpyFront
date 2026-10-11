// The likeness in the register: a gallery of period portraits to choose a
// face from, filtered by years, people, station, hair, headwear and dress
// (set at first from the character), a large preview of the one chosen, and
// its tuning: the hair's colour and shade, the clothes' colour and shade,
// greying with the years, and which way they face.

import { html, LitElement, nothing, PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  ageBand,
  BAND_AGES,
  classOfStation,
  CLOTH_COLORS,
  copyLook,
  HAIR_TONES,
  type Look,
  peopleOfCulture,
  type Sitter,
  sitterAt,
  SITTERS,
  type Station,
  suitability,
  type Swatch,
  type Wanted,
} from "../engine/Appearance";
import { GALLERY } from "../engine/Gallery";
import type {
  AgeBand,
  Dress,
  Headwear,
  People,
  SitterClass,
} from "../engine/Sitters";
import { thumbUrl } from "./Gallery";
import { lookPicture } from "./Portrait";
import { creditOf } from "./PortraitCredits";

type HairFilter =
  | "any"
  | "black"
  | "dark"
  | "brown"
  | "auburn"
  | "fair"
  | "grey"
  | "wig"
  | "hidden";

interface Filters {
  band: AgeBand | "any";
  people: People | "any";
  cls: SitterClass | "any";
  hair: HairFilter;
  head: Headwear | "any";
  dress: Dress | "any";
}

const BAND_NAMES: Record<AgeBand, string> = {
  child: "Children",
  youth: "Young (16 to 24)",
  prime: "In their prime (25 to 39)",
  middle: "Middle years (40 to 54)",
  elder: "Old (55 and over)",
};

const PEOPLE_NAMES: Record<People, string> = {
  english: "English",
  french: "French",
  spanish: "Spanish",
  dutch: "Dutch",
  swedish: "Swedish",
  portuguese: "Portuguese",
  native: "Native peoples",
  african: "African",
  mestizo: "Of mixed descent",
};

const CLASS_NAMES: Record<SitterClass, string> = {
  labourer: "Labourers and servants",
  trades: "Tradesfolk",
  merchant: "Merchants",
  learned: "Learned",
  gentry: "Gentry",
  clergy: "Clergy",
  soldier: "Soldiers",
  officer: "Officers",
};

const HAIR_NAMES: Record<HairFilter, string> = {
  any: "Any hair",
  black: "Black",
  dark: "Dark brown",
  brown: "Brown",
  auburn: "Auburn or red",
  fair: "Fair",
  grey: "Grey or white",
  wig: "A wig",
  hidden: "Covered",
};

const HEAD_NAMES: Record<Headwear, string> = {
  bare: "Bareheaded",
  hat: "A hat",
  cap: "A cap or coif",
  veil: "A veil or hood",
  headdress: "A headdress",
};

const DRESS_NAMES: Record<Dress, string> = {
  plain: "Plain",
  sober: "Sober black",
  fine: "Finery",
  armour: "Armour",
  uniform: "Uniform",
  clerical: "Clerical",
  native: "Native dress",
};

function matches(s: Sitter, f: Filters): boolean {
  if (f.band !== "any" && s.age !== f.band) return false;
  if (f.people !== "any" && s.people !== f.people) return false;
  if (f.cls !== "any" && s.cls !== f.cls) return false;
  if (f.head !== "any" && s.head !== f.head) return false;
  if (f.dress !== "any" && s.dress !== f.dress) return false;
  switch (f.hair) {
    case "any":
      return true;
    case "wig":
      return s.wig;
    case "grey":
      return s.hair === "grey" || s.hair === "white";
    default:
      return !s.wig && s.hair === f.hair;
  }
}

/** Small extras for meeting the finer filters, on top of how well a picture suits. */
function finer(s: Sitter, f: Filters): number {
  let n = 0;
  if (
    f.hair !== "any" &&
    matches(s, {
      ...f,
      band: "any",
      people: "any",
      cls: "any",
      head: "any",
      dress: "any",
    })
  )
    n += 3;
  if (f.head !== "any" && s.head === f.head) n += 2;
  if (f.dress !== "any" && s.dress === f.dress) n += 2;
  return n;
}

const PAGE = 24;

@customElement("cq-likeness")
export class LikenessPicker extends LitElement {
  @property({ attribute: false }) look!: Look;
  @property({ attribute: false }) female = false;
  @property({ attribute: false }) age = 22;
  @property({ attribute: false }) culture = "english";
  @property({ attribute: false }) native = false;
  @property({ attribute: false }) station: Station = "tradesman";
  /** The colour of the sitter's frame ribbon. */
  @property({ attribute: false }) frame = "#7b3322";
  @property({ attribute: false }) name = "";
  /** The year they're seen in (their own years' fashions come first). */
  @property({ attribute: false }) year = 1700;
  /** Show children's portraits (a child of the family choosing). */
  @property({ attribute: false }) child = false;

  @state() private f: Filters = {
    band: "any",
    people: "any",
    cls: "any",
    hair: "any",
    head: "any",
    dress: "any",
  };
  /** Seen now, at fifty or at seventy. */
  @state() private later = 0;
  @state() private all = false;
  /** Whose filters these are: when the character changes, they're set afresh. */
  private basis = "";

  createRenderRoot() {
    return this;
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    const people: People = this.native
      ? "native"
      : peopleOfCulture(this.culture);
    const basis = `${this.female}|${ageBand(this.age)}|${people}|${this.station}`;
    if (basis !== this.basis) {
      this.basis = basis;
      const f: Filters = {
        band: this.child ? "child" : ageBand(Math.max(16, this.age)),
        people,
        cls: this.native ? "any" : classOfStation(this.station),
        hair: "any",
        head: "any",
        dress: "any",
      };
      // Their station only narrows the gallery when it leaves a few faces;
      // otherwise those of it come first.
      const pool = this.pool();
      if (pool.filter((s) => matches(s, f)).length < 4) f.cls = "any";
      if (pool.filter((s) => matches(s, f)).length < 4) f.band = "any";
      this.f = f;
      this.all = false;
    }
    void changed;
  }

  private emit(look: Look): void {
    this.look = look;
    this.dispatchEvent(
      new CustomEvent<Look>("cq-look", { detail: look, bubbles: true }),
    );
  }

  private patch(p: Partial<Look>): void {
    this.emit({ ...copyLook(this.look), ...p });
  }

  private choose(s: Sitter): void {
    if (s.age === "child") this.patch({ kid: s.id });
    else this.patch({ p: s.id });
  }

  /** The sitters to choose among: the sitter's own sex, child or grown. */
  private pool(): Sitter[] {
    const sex = this.female ? "f" : "m";
    return GALLERY.filter(
      (s) => s.sex === sex && (s.age === "child") === this.child,
    );
  }

  /** Who the gallery is looking for: the filters, or the character where a filter is open. */
  private wanted(): Wanted {
    const f = this.f;
    const band =
      f.band !== "any"
        ? f.band
        : this.child
          ? "child"
          : ageBand(Math.max(16, this.age));
    return {
      id: 0,
      female: this.female,
      age: band === "child" ? 9 : BAND_AGES[band][0] + 4,
      people:
        f.people !== "any"
          ? f.people
          : this.native
            ? "native"
            : peopleOfCulture(this.culture),
      cls: f.cls !== "any" ? f.cls : classOfStation(this.station),
      year: this.year,
    };
  }

  /** The faces the filters show, best suited first, and some near them when they're few. */
  private shown(): { list: Sitter[]; near: Sitter[] } {
    const w = this.wanted();
    const score = (s: Sitter) => suitability(s, w) + finer(s, this.f);
    const ranked = this.pool()
      .map((s) => ({ s, v: score(s) }))
      .filter((x) => x.v > -Infinity)
      .sort((a, b) => b.v - a.v);
    const list = ranked.filter((x) => matches(x.s, this.f)).map((x) => x.s);
    const near =
      list.length >= 8
        ? []
        : ranked
            .filter((x) => !matches(x.s, this.f))
            .slice(0, 12 - Math.min(list.length, 4))
            .map((x) => x.s);
    return { list, near };
  }

  /** Another face from those the filters show. */
  roll(): void {
    const { list: exact, near } = this.shown();
    const list = exact.length ? exact : near;
    const cur = this.current();
    const others = list.filter((s) => s.id !== cur?.id);
    const pick = others[Math.floor(Math.random() * others.length)];
    if (pick) this.choose(pick);
  }

  private current(): Sitter | undefined {
    return SITTERS.get(this.child ? (this.look.kid ?? "") : this.look.p);
  }

  private shownAge(): number {
    return [this.age, Math.max(this.age, 50), Math.max(this.age, 70)][
      this.later
    ];
  }

  render(): TemplateResult {
    if (!this.look) return html``;
    const age = this.child ? Math.min(this.age, 15) : this.shownAge();
    const cur = sitterAt(this.look, age);
    const credit = creditOf(cur.id);
    return html`<div class="cq-lk">
      <div class="cq-lk-side">
        <figure class="cq-lk-preview">
          <span class="cq-sitter" style="--frame:${this.frame}">
            <span
              class="cq-portrait huge cq-lk-picture"
              role="img"
              aria-label=${`Likeness of ${this.name}`}
              data-p=${cur.id}
              >${lookPicture(this.look, age)}</span
            >
          </span>
          <figcaption>
            ${credit
              ? html`<span class="cq-lk-credit"
                  ><i>${credit.title}</i>, ${credit.author}</span
                >`
              : nothing}
          </figcaption>
        </figure>
        ${this.child
          ? nothing
          : html`<div
              class="cq-seg small cq-lk-ages"
              role="radiogroup"
              aria-label="Seen at"
            >
              ${["Now", "At 50", "At 70"].map(
                (label, i) =>
                  html`<button
                    role="radio"
                    aria-checked=${this.later === i}
                    ?disabled=${i > 0 && [50, 70][i - 1] <= this.age}
                    @click=${() => (this.later = i)}
                  >
                    ${label}
                  </button>`,
              )}
            </div>`}
        ${this.tuning(cur)}
      </div>
      <div class="cq-lk-main">${this.filters()} ${this.grid(cur)}</div>
    </div>`;
  }

  // ---------------------------------------------------------------- tuning

  private tuning(s: Sitter): TemplateResult {
    const l = this.look;
    const hairNote = s.wig
      ? "A wig: it keeps its powder."
      : s.hair === "hidden"
        ? "Hidden under the cap."
        : "";
    const painted = (hex: string, on: boolean, pick: () => void) =>
      html`<button
        role="radio"
        class="painted"
        aria-checked=${on}
        title="As painted"
        aria-label="As painted"
        style="--sw:${hex}"
        @click=${pick}
      ></button>`;
    return html`<div class="cq-lk-tune">
      <div class="cq-lk-row">
        <span class="cq-field-label">Hair</span>
        ${hairNote
          ? html`<span class="cq-muted small">${hairNote}</span>`
          : html`<div
                class="cq-swatches-pick"
                role="radiogroup"
                aria-label="Hair colour"
              >
                ${painted(s.hx, l.hair < 0, () => this.patch({ hair: -1 }))}
                ${this.swatches(HAIR_TONES, l.hair, (i) =>
                  this.patch({ hair: i }),
                )}
              </div>
              ${this.shade("Hair", l.hairL, (v) => this.patch({ hairL: v }))}`}
      </div>
      <div class="cq-lk-row">
        <span class="cq-field-label">Clothes</span>
        <div
          class="cq-swatches-pick"
          role="radiogroup"
          aria-label="Clothes colour"
        >
          ${painted(s.cx, l.cloth < 0, () => this.patch({ cloth: -1 }))}
          ${this.swatches(CLOTH_COLORS, l.cloth, (i) =>
            this.patch({ cloth: i }),
          )}
        </div>
        ${this.shade("Clothes", l.clothL, (v) => this.patch({ clothL: v }))}
      </div>
      <div class="cq-lk-row inline">
        <span class="cq-field-label">Greys</span>
        <div class="cq-seg small" role="radiogroup" aria-label="Greying">
          ${["Never", "As most do", "Early"].map(
            (label, i) =>
              html`<button
                role="radio"
                aria-checked=${l.grey === i}
                @click=${() => this.patch({ grey: i })}
              >
                ${label}
              </button>`,
          )}
        </div>
      </div>
      <div class="cq-lk-row inline">
        <span class="cq-field-label">Facing</span>
        <button
          class="cq-btn quiet small cq-lk-flip"
          aria-pressed=${l.flip}
          @click=${() => this.patch({ flip: !l.flip })}
        >
          ⇋ Mirror the painting
        </button>
      </div>
    </div>`;
  }

  private swatches(
    list: Swatch[],
    value: number,
    pick: (i: number) => void,
  ): TemplateResult[] {
    return list.map(
      (sw, i) =>
        html`<button
          role="radio"
          aria-checked=${value === i}
          title=${sw.name}
          aria-label=${sw.name}
          style="--sw:${sw.hex}"
          @click=${() => pick(i)}
        ></button>`,
    );
  }

  private shade(
    what: string,
    v: number,
    set: (v: number) => void,
  ): TemplateResult {
    const names = [
      "Much darker",
      "Darker",
      "As chosen",
      "Lighter",
      "Much lighter",
    ];
    return html`<div class="cq-lk-shade" aria-label=${`${what} shade`}>
      <button
        class="cq-step-btn"
        aria-label=${`${what} darker`}
        ?disabled=${v <= -2}
        @click=${() => set(Math.max(-2, v - 1))}
      >
        −
      </button>
      <span class="cq-lk-shade-v">${names[v + 2]}</span>
      <button
        class="cq-step-btn"
        aria-label=${`${what} lighter`}
        ?disabled=${v >= 2}
        @click=${() => set(Math.min(2, v + 1))}
      >
        +
      </button>
    </div>`;
  }

  // ---------------------------------------------------------------- the gallery

  private select<T extends string>(
    label: string,
    key: keyof Filters,
    any: string,
    options: [T, string][],
  ): TemplateResult {
    const v = this.f[key] as string;
    return html`<label class="cq-field cq-lk-filter">
      <span>${label}</span>
      <select
        data-filter=${key}
        @change=${(e: Event) => {
          this.f = {
            ...this.f,
            [key]: (e.target as HTMLSelectElement).value,
          };
          this.all = false;
        }}
      >
        <option value="any" ?selected=${v === "any"}>${any}</option>
        ${options.map(
          ([k, name]) =>
            html`<option value=${k} ?selected=${v === k}>${name}</option>`,
        )}
      </select>
    </label>`;
  }

  private filters(): TemplateResult {
    const pool = this.pool();
    const has = <K extends keyof Sitter>(k: K, v: Sitter[K]) =>
      pool.some((s) => s[k] === v);
    const bands = (
      this.child
        ? (["child"] as AgeBand[])
        : (["youth", "prime", "middle", "elder"] as AgeBand[])
    ).filter((b) => has("age", b));
    return html`<div class="cq-lk-filters">
      ${this.child
        ? nothing
        : this.select(
            "Years",
            "band",
            "Any age",
            bands.map((b) => [b, BAND_NAMES[b]]),
          )}
      ${this.select(
        "People",
        "people",
        "Any people",
        (Object.keys(PEOPLE_NAMES) as People[])
          .filter((p) => has("people", p))
          .map((p) => [p, PEOPLE_NAMES[p]]),
      )}
      ${this.select(
        "Station",
        "cls",
        "Any station",
        (Object.keys(CLASS_NAMES) as SitterClass[])
          .filter((c) => has("cls", c))
          .map((c) => [c, CLASS_NAMES[c]]),
      )}
      ${this.select(
        "Hair",
        "hair",
        "Any hair",
        (Object.keys(HAIR_NAMES) as HairFilter[])
          .filter((h) => h !== "any")
          .map((h) => [h, HAIR_NAMES[h]]),
      )}
      ${this.select(
        "On the head",
        "head",
        "Anything",
        (Object.keys(HEAD_NAMES) as Headwear[])
          .filter((h) => has("head", h))
          .map((h) => [h, HEAD_NAMES[h]]),
      )}
      ${this.select(
        "Dress",
        "dress",
        "Any dress",
        (Object.keys(DRESS_NAMES) as Dress[])
          .filter((d) => has("dress", d))
          .map((d) => [d, DRESS_NAMES[d]]),
      )}
    </div>`;
  }

  private thumb(s: Sitter, cur: Sitter): TemplateResult {
    return html`<li>
      <button
        class="cq-lk-thumb ${s.id === cur.id ? "on" : ""}"
        role="option"
        aria-selected=${s.id === cur.id}
        data-p=${s.id}
        title=${creditOf(s.id)?.title ?? ""}
        @click=${() => this.choose(s)}
      >
        <img
          src=${thumbUrl(s.id) ?? ""}
          alt=${creditOf(s.id)?.title ?? "A portrait"}
          loading="lazy"
          decoding="async"
        />
      </button>
    </li>`;
  }

  private grid(cur: Sitter): TemplateResult {
    const { list, near } = this.shown();
    const shown = this.all ? list : list.slice(0, PAGE);
    const who = this.child
      ? this.female
        ? "girls"
        : "boys"
      : this.female
        ? "women"
        : "men";
    return html`<div class="cq-lk-gallery">
      <div class="cq-lk-count">
        ${list.length
          ? html`<span
              >${list.length} portrait${list.length === 1 ? "" : "s"} of
              ${who}</span
            >`
          : html`<span class="cq-why">None quite like that.</span>`}
        <button class="cq-btn quiet small" @click=${() => this.roll()}>
          Another face
        </button>
      </div>
      ${shown.length
        ? html`<ul class="cq-lk-grid" role="listbox" aria-label="Portraits">
            ${shown.map((s) => this.thumb(s, cur))}
          </ul>`
        : nothing}
      ${!this.all && list.length > PAGE
        ? html`<button
            class="cq-btn quiet small cq-lk-more"
            @click=${() => (this.all = true)}
          >
            Show all ${list.length}
          </button>`
        : nothing}
      ${near.length
        ? html`<p class="cq-lk-near">
              ${list.length ? "And some near it:" : "The nearest:"}
            </p>
            <ul class="cq-lk-grid near" role="listbox" aria-label="Near it">
              ${near.map((s) => this.thumb(s, cur))}
            </ul>`
        : nothing}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cq-likeness": LikenessPicker;
  }
}
