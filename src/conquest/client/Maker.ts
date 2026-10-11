// Making a character: who your people are and where you're from, your name
// and face, your arms and motto, how you were brought up, what you're good
// at and what you're like. Every section can be rolled, and the whole thing
// signed at the foot like a parish register. Used in the room before a game
// and in a running world, when a player drops in or begins again.

import { html, LitElement, nothing, PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  fitLook,
  generateLook,
  type LookSeed,
  stationOfBackground,
} from "../engine/Appearance";
import { backgroundGroup, JOB_GROUPS, type JobGroup } from "../engine/JobsData";
import {
  homeChoices,
  planBudget,
  planProblem,
  planSkills,
} from "../engine/Life";
import {
  ATTRIBUTE_HELP,
  ATTRIBUTE_NAMES,
  BACKGROUNDS,
  BASE_SKILL,
  CHARGES,
  CLAN_CHARGES,
  clanName,
  COLONIST_BACKGROUNDS,
  CREATION_TRAITS,
  DIVISIONS,
  faithsFor,
  FRAME_COLORS,
  JOBS,
  LIFE_MAX_AGE,
  LIFE_MAX_TRAITS,
  LIFE_MIN_AGE,
  LIFE_STAT_MAX,
  LIFE_STAT_MIN,
  LIFE_TRAIT_TEXT,
  MOTTO_MAX,
  NATIVE_BACKGROUNDS,
  NATIVE_CLANS,
  NATIVE_NAMES,
  SKILL_HELP,
  SKILL_NAMES,
  skillStepCost,
  START_SKILL_MAX,
  TINCTURES,
} from "../engine/LifeRules";
import { AMERICAS, worldOf } from "../engine/Map";
import { NAMES } from "../engine/Names";
import { settlers, tribesfolk, yearOf } from "../engine/Queries";
import { POWER_RULES, RELIGION_NAMES, TRAITS } from "../engine/Rules";
import type {
  BackgroundId,
  Charge,
  Division,
  GameState,
  LifePlan,
  Nation,
  Skill,
  Stat,
  Tincture,
} from "../engine/Types";
import { SKILLS, STATS } from "../engine/Types";
import { arms } from "./Arms";
import { flagFor } from "./Flags";
import "./Likeness";
import "./Range";
import { TERRAIN_NAMES } from "./Text";
import { nationVars } from "./Theme";

const DRAFT_KEY = "derpy_conquest_character";
const world = worldOf(AMERICAS);

const pick = <T>(list: readonly T[]): T =>
  list[Math.floor(Math.random() * list.length)];
const shuffle = <T>(list: T[]): T[] => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const MOTTOS = [
  "Fortune favours the bold",
  "Labor omnia vincit",
  "Nil desperandum",
  "Spes mea in Deo",
  "Per ardua",
  "Fide et fortitudine",
  "Steady and true",
  "By hook or by crook",
  "Virtute et labore",
  "Through the storm",
  "Slow but sure",
  "Hold fast",
  "Never despair",
  "Faithful unto death",
  "Without fear, without reproach",
  "Better to wear out than rust",
];
const NATIVE_MOTTOS = [
  "We are still here",
  "The land remembers",
  "Seven generations",
  "Walk on the earth gently",
  "Many hands, one fire",
  "The river does not hurry",
];

export function cultureOf(s: GameState, origin: string): string {
  const n = s.nations.find((x) => x.key === origin);
  return n?.culture ?? POWER_RULES[origin]?.culture ?? "english";
}

function isNativeOrigin(s: GameState, origin: string): boolean {
  return s.nations.find((n) => n.key === origin)?.kind === "native";
}

function namesFor(
  s: GameState,
  origin: string,
): { male: string[]; female: string[]; family: string[] } {
  if (isNativeOrigin(s, origin))
    return {
      male: NATIVE_NAMES.male,
      female: NATIVE_NAMES.female,
      family: NATIVE_CLANS.map(clanName),
    };
  return NAMES[cultureOf(s, origin)] ?? NAMES.english;
}

/** Peoples a character can come from in this world: living powers and native nations. */
export function peoples(s: GameState): Nation[] {
  return s.nations.filter(
    (n) =>
      n.alive &&
      (n.kind === "power" || n.kind === "native") &&
      homeChoices(s, n.key).length > 0,
  );
}

function rollSigil(native: boolean): LifePlan["sigil"] {
  const tinctures = Object.keys(TINCTURES) as Tincture[];
  const metals: Tincture[] = ["or", "argent"];
  const colours = tinctures.filter((t) => !metals.includes(t));
  const field = Math.random() < 0.6 ? pick(colours) : pick(metals);
  const contrast = metals.includes(field) ? pick(colours) : pick(metals);
  const charges = native
    ? CLAN_CHARGES
    : (Object.keys(CHARGES) as Charge[]).filter(
        (c) => c !== "none" && !CLAN_CHARGES.includes(c),
      );
  return {
    field,
    division: native
      ? pick(["plain", "fess", "chief"] as Division[])
      : pick(Object.keys(DIVISIONS) as Division[]),
    tincture: contrast,
    charge: pick(charges),
    chargeTincture: contrast === field ? pick(metals) : contrast,
  };
}

function homeOrder(s: GameState, origin: string): number[] {
  const n = s.nations.find((x) => x.key === origin);
  return homeChoices(s, origin).sort(
    (a, b) =>
      Number(b === n?.capital) - Number(a === n?.capital) ||
      settlers(s.provinces[b]) +
        tribesfolk(s.provinces[b]) -
        (settlers(s.provinces[a]) + tribesfolk(s.provinces[a])),
  );
}

/** A fresh character for a people (the first power, by default). */
export function freshPlan(s: GameState, origin?: string): LifePlan {
  const list = peoples(s);
  const o = origin ?? list.find((n) => n.kind === "power")?.key ?? list[0].key;
  const native = isNativeOrigin(s, o);
  const female = Math.random() < 0.3;
  const names = namesFor(s, o);
  const plan: LifePlan = {
    origin: o,
    home: homeOrder(s, o)[0],
    first: pick(female ? names.female : names.male),
    family: pick(names.family),
    female,
    age: 22,
    religion: faithsFor(o, native)[0],
    face: 0,
    sigil: rollSigil(native),
    frame: pick(FRAME_COLORS),
    motto: "",
    background: native ? "hunter" : "farmer",
    stats: { dip: 5, mar: 5, ste: 5, int: 5, lea: 5 },
    skills: {},
    traits: [],
  };
  plan.look = generateLook(lookSeed(s, plan, Math.floor(Math.random() * 1e9)));
  return plan;
}

/** Who a plan's likeness is drawn for: their people, sex, age, trade, year. */
export function lookSeed(s: GameState, p: LifePlan, id: number): LookSeed {
  return {
    id,
    culture: cultureOf(s, p.origin),
    female: p.female,
    age: p.age,
    station: stationOfBackground(p.background),
    year: yearOf(s),
    religion: p.religion,
  };
}

/** Spend whatever points are left, leaning toward the background's trade. */
function spendPoints(plan: LifePlan): LifePlan {
  const p: LifePlan = {
    ...plan,
    stats: { ...plan.stats },
    skills: { ...plan.skills },
  };
  const bg = BACKGROUNDS[p.background];
  const job = bg.job ? JOBS[bg.job] : null;
  const favour: Stat[] = [];
  if (job) favour.push(statFor(job.main), statFor(job.second));
  for (let tries = 0; tries < 40; tries++) {
    const b = planBudget(p);
    if (b.statsUsed >= b.statsBudget) break;
    const st =
      Math.random() < 0.6 && favour.length ? pick(favour) : pick([...STATS]);
    if (p.stats[st] < 9) p.stats[st]++;
  }
  const lean: Skill[] = job ? [job.main, job.main, job.second] : [];
  for (let tries = 0; tries < 80; tries++) {
    const b = planBudget(p);
    if (b.skillsUsed >= b.skillsBudget) break;
    const sk =
      Math.random() < 0.5 && lean.length ? pick(lean) : pick([...SKILLS]);
    const now = planSkills(p)[sk];
    if (now >= START_SKILL_MAX - 1) continue;
    const next = {
      ...p,
      skills: { ...p.skills, [sk]: (p.skills[sk] ?? 0) + 1 },
    };
    const nb = planBudget(next);
    if (nb.skillsUsed <= nb.skillsBudget) p.skills = next.skills;
  }
  return p;
}

function statFor(sk: Skill): Stat {
  return (
    {
      fighting: "mar",
      leadership: "mar",
      persuasion: "dip",
      trade: "ste",
      craft: "ste",
      farming: "ste",
      seamanship: "mar",
      woodcraft: "int",
      letters: "lea",
      faith: "lea",
      medicine: "lea",
      stealth: "int",
    } as const
  )[sk];
}

function rollTraits(plan: LifePlan): TraitPick {
  const out: LifePlan["traits"] = [];
  const want = 1 + Math.floor(Math.random() * 3);
  for (const t of shuffle(CREATION_TRAITS)) {
    if (out.length >= want) break;
    const opp = TRAITS[t].opposite;
    if (opp && out.includes(opp)) continue;
    const next = [...out, t];
    const cost = next.reduce((m, x) => m + TRAITS[x].cost, 0);
    if (cost <= 2) out.push(t);
  }
  return { ...plan, traits: out };
}
type TraitPick = LifePlan;

function loadDraft(s: GameState): LifePlan | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const plan = JSON.parse(raw) as LifePlan;
    // Keep the character, but they may need a home that exists in this world.
    if (!peoples(s).some((n) => n.key === plan.origin)) return null;
    if (!homeChoices(s, plan.origin).includes(plan.home))
      plan.home = homeOrder(s, plan.origin)[0];
    plan.look = plan.look
      ? fitLook(plan.look, lookSeed(s, plan, Math.floor(Math.random() * 1e9)))
      : generateLook(lookSeed(s, plan, Math.floor(Math.random() * 1e9)));
    return planProblem(s, plan) === null ? plan : null;
  } catch {
    return null;
  }
}

@customElement("cq-maker")
export class Maker extends LitElement {
  /** The world the character will live in (a preview of the start year, or the running game). */
  @property({ attribute: false }) world!: GameState;
  /** What the sign button says. */
  @property({ attribute: false }) signLabel = "Sign the register";
  /** The plan last sent, to show it as signed until it changes. */
  @property({ attribute: false }) signed: string | null = null;
  @property({ attribute: false }) intro: TemplateResult | string = "";

  @state() private plan: LifePlan | null = null;
  @state() private natives = false;
  /** A face chosen from the gallery (not left to follow the character). */
  private lookPicked = false;
  /** LIFE (r11): which kind of upbringing the register shows (null: the chosen one's). */
  @state() private bgGroup: JobGroup | "all" | null = null;

  createRenderRoot() {
    return this;
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("world") && this.world) {
      if (!this.plan)
        this.plan =
          loadDraft(this.world) ??
          spendPoints(rollTraits(freshPlan(this.world)));
      else if (planProblem(this.world, this.plan)?.includes("home"))
        this.set({ home: homeOrder(this.world, this.plan.origin)[0] });
      this.natives = isNativeOrigin(this.world, this.plan.origin);
    }
  }

  private set(patch: Partial<LifePlan>): void {
    if (!this.plan) return;
    const before = this.plan;
    this.plan = { ...this.plan, ...patch };
    // The likeness keeps up: until a face is chosen from the gallery it
    // follows the character's people, sex, years and trade; once chosen it
    // stays unless it no longer fits (another sex, or another people's dress).
    const p = this.plan;
    if (p.look && !patch.look && this.world) {
      const seed = lookSeed(this.world, p, Math.floor(Math.random() * 1e9));
      const changed =
        p.background !== before.background ||
        p.female !== before.female ||
        p.origin !== before.origin ||
        p.age !== before.age;
      if (changed) p.look = fitLook(p.look, seed, !this.lookPicked);
    }
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(this.plan));
    } catch {
      // ignore
    }
  }

  private chooseOrigin(key: string): void {
    const s = this.world;
    const p = this.plan!;
    if (p.origin === key) return;
    const native = isNativeOrigin(s, key);
    const wasNative = isNativeOrigin(s, p.origin);
    const names = namesFor(s, key);
    const patch: Partial<LifePlan> = {
      origin: key,
      home: homeOrder(s, key)[0],
      religion: faithsFor(key, native)[0],
    };
    if (native !== wasNative || cultureOf(s, key) !== cultureOf(s, p.origin)) {
      patch.first = pick(p.female ? names.female : names.male);
      patch.family = pick(names.family);
    }
    if (native !== wasNative) {
      patch.background = native ? "hunter" : "farmer";
      patch.skills = {};
      patch.sigil = rollSigil(native);
    }
    this.set(patch);
  }

  private rollAll(): void {
    const s = this.world;
    const list = peoples(s);
    // Mostly colonists; now and then someone of the country.
    const pool =
      Math.random() < 0.7 ? list.filter((n) => n.kind === "power") : list;
    const origin = pick(pool.length ? pool : list).key;
    let p = freshPlan(s, origin);
    p.home = pick(homeOrder(s, origin).slice(0, 4));
    p.age = LIFE_MIN_AGE + Math.floor(Math.random() * 15);
    const native = isNativeOrigin(s, origin);
    p.religion = pick(faithsFor(origin, native));
    p.background = pick(native ? NATIVE_BACKGROUNDS : COLONIST_BACKGROUNDS);
    p.motto = Math.random() < 0.7 ? pick(native ? NATIVE_MOTTOS : MOTTOS) : "";
    p = spendPoints(rollTraits(p));
    p.look = generateLook(lookSeed(s, p, Math.floor(Math.random() * 1e9)));
    this.lookPicked = false;
    this.plan = p;
    this.set({});
  }

  private sign(): void {
    if (!this.plan || planProblem(this.world, this.plan)) return;
    this.dispatchEvent(
      new CustomEvent<LifePlan>("cq-plan", {
        detail: this.plan,
        bubbles: true,
      }),
    );
  }

  render(): TemplateResult {
    const p = this.plan;
    if (!p || !this.world) return html``;
    const s = this.world;
    const nation = s.nations.find((n) => n.key === p.origin);
    const problem = planProblem(s, p);
    const signed = this.signed === JSON.stringify(p);
    return html`<section
      class="cq-maker"
      style=${nationVars(nation?.color ?? "#7b3322")}
    >
      ${this.intro
        ? html`<p class="cq-maker-intro">${this.intro}</p>`
        : nothing}
      ${this.peopleSection()} ${this.whoSection()} ${this.armsSection()}
      ${this.upbringingSection()} ${this.pointsSection()}
      ${this.traitsSection()}
      <div class="cq-gov-foot cq-maker-foot">
        <button class="cq-btn quiet" @click=${() => this.rollAll()}>
          Roll everything
        </button>
        <span class="cq-signature" aria-hidden="true"
          ><span class="cq-sig-label">Signed,</span
          ><span class="cq-sig-name">${p.first} ${p.family}</span></span
        >
        ${problem ? html`<span class="cq-why">${problem}</span>` : nothing}
        ${signed
          ? html`<span class="cq-sworn">In the register</span>`
          : html`<button
              class="cq-btn primary"
              ?disabled=${!!problem}
              @click=${() => this.sign()}
            >
              ${this.signLabel}
            </button>`}
      </div>
    </section>`;
  }

  private head(n: string, title: string, roll?: () => void): TemplateResult {
    return html`<div class="cq-maker-head">
      <h2 class="cq-h2 step"><span class="cq-step">${n}</span> ${title}</h2>
      ${roll
        ? html`<button class="cq-btn quiet small" @click=${roll}>Roll</button>`
        : nothing}
    </div>`;
  }

  // ---------------------------------------------------------------- I. your people

  private peopleSection(): TemplateResult {
    const s = this.world;
    const p = this.plan!;
    const list = peoples(s);
    const powers = list.filter((n) => n.kind === "power");
    const natives = list.filter((n) => n.kind === "native");
    const homes = homeOrder(s, p.origin);
    const native = isNativeOrigin(s, p.origin);
    const hp = s.provinces[p.home];
    const def = AMERICAS.provinces[p.home];
    return html`<div class="cq-maker-part">
      ${this.head("I", "Your people", () =>
        this.chooseOrigin(pick(Math.random() < 0.7 ? powers : list).key),
      )}
      <div
        class="cq-seg"
        role="radiogroup"
        aria-label="Colonists or native peoples"
      >
        <button
          role="radio"
          aria-checked=${!this.natives}
          @click=${() => {
            this.natives = false;
            if (native && powers[0]) this.chooseOrigin(powers[0].key);
          }}
        >
          Colonists
        </button>
        <button
          role="radio"
          aria-checked=${this.natives}
          @click=${() => {
            this.natives = true;
            if (!native && natives[0]) this.chooseOrigin(natives[0].key);
          }}
        >
          Native peoples
        </button>
      </div>
      <ul class="cq-peoples ${this.natives ? "natives" : ""}">
        ${(this.natives ? natives : powers).map(
          (n) =>
            html`<li>
              <button
                class="cq-people ${n.key === p.origin ? "on" : ""}"
                title=${n.name.replace(/^the /, "")}
                style=${nationVars(n.color)}
                aria-pressed=${n.key === p.origin}
                @click=${() => this.chooseOrigin(n.key)}
              >
                ${flagFor(n, "cq-flag lg")}
                <span class="cq-people-name"
                  >${n.name.replace(/^the /, "")}</span
                >
                ${n.kind === "power"
                  ? html`<span class="cq-people-note"
                      >${homeChoices(s, n.key).length} settlements</span
                    >`
                  : nothing}
              </button>
            </li>`,
        )}
      </ul>
      <div class="cq-home-pick">
        <label class="cq-field">
          <span>${native ? "Your village" : "Your home town"}</span>
          <select
            @change=${(e: Event) =>
              this.set({ home: Number((e.target as HTMLSelectElement).value) })}
          >
            ${homes.map(
              (h) =>
                html`<option value=${h} ?selected=${h === p.home}>
                  ${AMERICAS.provinces[h].name}${h ===
                  s.nations.find((n) => n.key === p.origin)?.capital
                    ? " (capital)"
                    : ""}
                </option>`,
            )}
          </select>
        </label>
        <p class="cq-muted small">
          ${TERRAIN_NAMES[def.terrain]}${def.coastal ? ", on the coast" : ""}.
          ${native
            ? `About ${Math.round(tribesfolk(hp) / 10) * 10} people live here.`
            : `About ${Math.round(settlers(hp) / 10) * 10} settlers${hp.b.church ? ", a church" : ""}${hp.b.port ? ", a harbour" : ""}${hp.b.fort ? ", a fort" : ""}.`}
          ${world.raw[p.home] ? `Its land yields ${world.raw[p.home]}.` : ""}
        </p>
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------- II. who you are

  private whoSection(): TemplateResult {
    const s = this.world;
    const p = this.plan!;
    const native = isNativeOrigin(s, p.origin);
    const names = namesFor(s, p.origin);
    const faiths = faithsFor(p.origin, native);
    return html`<div class="cq-maker-part cq-maker-who">
      <div class="cq-maker-head">
        <h2 class="cq-h2 step"><span class="cq-step">II</span> Who you are</h2>
        <button
          class="cq-btn quiet small"
          @click=${() => {
            const female = Math.random() < 0.4;
            this.set({
              female,
              first: pick(female ? names.female : names.male),
              family: pick(names.family),
              age: LIFE_MIN_AGE + Math.floor(Math.random() * 16),
              religion: pick(faiths),
            });
            const now = this.plan!;
            this.lookPicked = false;
            this.set({
              look: generateLook(
                lookSeed(s, now, Math.floor(Math.random() * 1e9)),
              ),
            });
          }}
        >
          Roll
        </button>
      </div>
      <div class="cq-gov-id cq-who-fields">
        <div class="cq-name-row">
          <label class="cq-field">
            <span>First name</span>
            <input
              .value=${p.first}
              maxlength="20"
              @input=${(e: Event) =>
                this.set({ first: (e.target as HTMLInputElement).value })}
            />
          </label>
          <label class="cq-field">
            <span>${native ? "Clan" : "Family"}</span>
            <input
              .value=${p.family}
              maxlength="28"
              @input=${(e: Event) =>
                this.set({ family: (e.target as HTMLInputElement).value })}
            />
          </label>
        </div>
        <button
          class="cq-link small"
          @click=${() =>
            this.set({
              first: pick(p.female ? names.female : names.male),
              family: pick(names.family),
            })}
        >
          Another name of the time
        </button>
        <div class="cq-seg" role="radiogroup" aria-label="Sex">
          <button
            role="radio"
            aria-checked=${!p.female}
            @click=${() =>
              this.set({
                female: false,
                first: p.female ? pick(names.male) : p.first,
              })}
          >
            Man
          </button>
          <button
            role="radio"
            aria-checked=${p.female}
            @click=${() =>
              this.set({
                female: true,
                first: p.female ? p.first : pick(names.female),
              })}
          >
            Woman
          </button>
        </div>
        <cq-range
          label="Age"
          .min=${LIFE_MIN_AGE}
          .max=${LIFE_MAX_AGE}
          .step=${1}
          .value=${p.age}
          .note=${(v: number) =>
            v < 20
              ? "Young: fewer points, a long life ahead"
              : v >= 33
                ? "Seasoned: more points, fewer years"
                : "In your prime"}
          @cq-input=${(e: CustomEvent<number>) => this.set({ age: e.detail })}
        ></cq-range>
        ${faiths.length > 1
          ? html`<div class="cq-seg" role="radiogroup" aria-label="Faith">
              ${faiths.map(
                (f) =>
                  html`<button
                    role="radio"
                    aria-checked=${p.religion === f}
                    @click=${() => this.set({ religion: f })}
                  >
                    ${RELIGION_NAMES[f]}
                  </button>`,
              )}
            </div>`
          : html`<p class="cq-muted small">
              Faith: ${RELIGION_NAMES[p.religion]}
            </p>`}
      </div>
      <h3 class="cq-h3 cq-look-head">Your likeness</h3>
      <p class="cq-muted small cq-look-note">
        Choose the face nearest your own from the gallery of portraits, then
        tune the hair and clothes.
      </p>
      ${p.look
        ? html`<cq-likeness
            .look=${p.look}
            .female=${p.female}
            .age=${p.age}
            .culture=${cultureOf(s, p.origin)}
            .native=${native}
            .station=${stationOfBackground(p.background)}
            .year=${yearOf(s)}
            .frame=${p.frame}
            .name=${`${p.first} ${p.family}`}
            @cq-look=${(e: CustomEvent<LifePlan["look"]>) => {
              this.lookPicked = true;
              this.set({ look: e.detail });
            }}
          ></cq-likeness>`
        : nothing}
    </div>`;
  }

  // ---------------------------------------------------------------- III. arms

  private armsSection(): TemplateResult {
    const s = this.world;
    const p = this.plan!;
    const native = isNativeOrigin(s, p.origin);
    const sg = p.sigil;
    const setSigil = (patch: Partial<LifePlan["sigil"]>) =>
      this.set({ sigil: { ...sg, ...patch } });
    const swatches = (
      label: string,
      value: Tincture,
      on: (t: Tincture) => void,
    ) =>
      html`<div class="cq-swatch-row">
        <span class="cq-field-label">${label}</span>
        <div class="cq-swatches-pick" role="radiogroup" aria-label=${label}>
          ${(Object.keys(TINCTURES) as Tincture[]).map(
            (t) =>
              html`<button
                role="radio"
                aria-checked=${value === t}
                title=${TINCTURES[t].name}
                aria-label=${TINCTURES[t].name}
                style="--sw:${TINCTURES[t].color}"
                @click=${() => on(t)}
              ></button>`,
          )}
        </div>
      </div>`;
    const charges = native
      ? CLAN_CHARGES
      : (Object.keys(CHARGES) as Charge[]).filter(
          (c) =>
            !CLAN_CHARGES.includes(c) ||
            c === "star" ||
            c === "crescent" ||
            c === "bird",
        );
    return html`<div class="cq-maker-part cq-maker-arms">
      ${this.head(
        "III",
        native
          ? "Your clan's sign, and colours"
          : "Your arms, colours and motto",
        () =>
          this.set({
            sigil: rollSigil(native),
            frame: pick(FRAME_COLORS),
            motto: pick(native ? NATIVE_MOTTOS : MOTTOS),
          }),
      )}
      <div class="cq-arms-grid">
        <figure class="cq-arms-preview">
          ${arms(sg, "cq-arms huge", native, `${p.family}'s arms`)}
          <figcaption>
            ${p.motto
              ? html`<i>“${p.motto}”</i>`
              : html`<span class="cq-muted">No motto</span>`}
          </figcaption>
        </figure>
        <div class="cq-arms-controls">
          ${swatches("Field", sg.field, (t) => setSigil({ field: t }))}
          ${native
            ? nothing
            : html`<label class="cq-field">
                <span>Division</span>
                <select
                  @change=${(e: Event) =>
                    setSigil({
                      division: (e.target as HTMLSelectElement)
                        .value as Division,
                    })}
                >
                  ${(Object.keys(DIVISIONS) as Division[]).map(
                    (d) =>
                      html`<option value=${d} ?selected=${sg.division === d}>
                        ${DIVISIONS[d]}
                      </option>`,
                  )}
                </select>
              </label>`}
          ${sg.division !== "plain"
            ? swatches(
                native ? "Band" : "Division's tincture",
                sg.tincture,
                (t) => setSigil({ tincture: t }),
              )
            : nothing}
          <label class="cq-field">
            <span>${native ? "Sign" : "Charge"}</span>
            <select
              @change=${(e: Event) =>
                setSigil({
                  charge: (e.target as HTMLSelectElement).value as Charge,
                })}
            >
              ${charges.map(
                (c) =>
                  html`<option value=${c} ?selected=${sg.charge === c}>
                    ${CHARGES[c]}
                  </option>`,
              )}
            </select>
          </label>
          ${sg.charge !== "none"
            ? swatches("Its tincture", sg.chargeTincture, (t) =>
                setSigil({ chargeTincture: t }),
              )
            : nothing}
          <div class="cq-swatch-row">
            <span class="cq-field-label">Frame and dress</span>
            <div
              class="cq-swatches-pick"
              role="radiogroup"
              aria-label="Frame colour"
            >
              ${FRAME_COLORS.map(
                (c) =>
                  html`<button
                    role="radio"
                    aria-checked=${p.frame === c}
                    aria-label="Colour ${c}"
                    style="--sw:${c}"
                    @click=${() => this.set({ frame: c })}
                  ></button>`,
              )}
            </div>
          </div>
          <label class="cq-field">
            <span>Motto</span>
            <input
              class="cq-motto-input"
              .value=${p.motto}
              maxlength=${MOTTO_MAX}
              placeholder="A line to live by"
              @input=${(e: Event) =>
                this.set({ motto: (e.target as HTMLInputElement).value })}
            />
          </label>
        </div>
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------- IV. upbringing

  private upbringingSection(): TemplateResult {
    const s = this.world;
    const p = this.plan!;
    const native = isNativeOrigin(s, p.origin);
    const list = native ? NATIVE_BACKGROUNDS : COLONIST_BACKGROUNDS;
    // LIFE (r11): many upbringings now, sorted by the kind of work.
    const groupOf = (b: BackgroundId) =>
      backgroundGroup(b, BACKGROUNDS[b], JOBS);
    const groups = JOB_GROUPS.filter((g) =>
      list.some((b) => groupOf(b) === g.id),
    );
    const mine = groupOf(p.background);
    const shown = groups.length <= 1 ? "all" : (this.bgGroup ?? mine);
    const cards =
      shown === "all" ? list : list.filter((b) => groupOf(b) === shown);
    return html`<div class="cq-maker-part">
      ${this.head("IV", "How you were brought up", () =>
        this.set({ background: pick(list), skills: {} }),
      )}
      <p class="cq-muted small">
        Your background sets the work you start in (if your home has the place
        for it), your purse, your first skills and how well known you are. Any
        trade can be taken up later in life, too.
      </p>
      ${groups.length > 1
        ? html`<nav
            class="cq-lv-chips cq-bg-groups"
            aria-label="Kinds of upbringing"
          >
            ${groups.map(
              (g) =>
                html`<button
                  class="${shown === g.id ? "on" : ""} ${mine === g.id
                    ? "mine"
                    : ""}"
                  aria-pressed=${shown === g.id}
                  title=${g.text}
                  @click=${() => (this.bgGroup = g.id)}
                >
                  ${g.name}
                  <small
                    >${list.filter((b) => groupOf(b) === g.id).length}</small
                  >
                </button>`,
            )}
            <button
              class=${shown === "all" ? "on" : ""}
              aria-pressed=${shown === "all"}
              @click=${() => (this.bgGroup = "all")}
            >
              All <small>${list.length}</small>
            </button>
          </nav>`
        : nothing}
      <ul class="cq-backgrounds">
        ${cards.map((b) => this.backgroundCard(b, p.background === b))}
      </ul>
    </div>`;
  }

  private backgroundCard(b: BackgroundId, on: boolean): TemplateResult {
    const def = BACKGROUNDS[b];
    const job = def.job ? JOBS[def.job] : null;
    const skills = (Object.entries(def.skills) as [Skill, number][])
      .sort((x, y) => y[1] - x[1])
      .map(([k, v]) => `${SKILL_NAMES[k]} +${v}`)
      .join(", ");
    return html`<li>
      <button
        class="cq-background ${on ? "on" : ""}"
        aria-pressed=${on}
        @click=${() => this.set({ background: b, skills: {} })}
      >
        <span class="cq-background-name">${def.name}</span>
        <span class="cq-background-blurb">${def.blurb}</span>
        <span class="cq-background-text">${def.text}</span>
        <span class="cq-background-facts">
          ${job
            ? html`<span>${job.ranks[0].title}</span>`
            : html`<span>No trade</span>`}
          <span>${def.purse} coins</span>
          ${def.renown ? html`<span>renown ${def.renown}</span>` : nothing}
          ${def.notoriety
            ? html`<span class="cq-bg-rogue">notoriety ${def.notoriety}</span>`
            : nothing}
        </span>
        <span class="cq-background-skills">${skills}</span>
      </button>
    </li>`;
  }

  // ---------------------------------------------------------------- V. attributes and skills

  private pointsSection(): TemplateResult {
    const p = this.plan!;
    const b = planBudget(p);
    const start = planSkills(p);
    const bg = BACKGROUNDS[p.background];
    const statLeft = b.statsBudget - b.statsUsed;
    const skillLeft = b.skillsBudget - b.skillsUsed;
    return html`<div class="cq-maker-part cq-maker-points">
      ${this.head("V", "What you're good at", () =>
        this.set(
          spendPoints({
            ...p,
            stats: { dip: 5, mar: 5, ste: 5, int: 5, lea: 5 },
            skills: {},
          }),
        ),
      )}
      <div class="cq-points-cols">
        <div>
          <div
            class="cq-points ${statLeft < 0 ? "over" : ""}"
            aria-live="polite"
          >
            <span class="cq-points-n">${statLeft}</span>
            <span
              >attribute point${statLeft === 1 ? "" : "s"} left of
              ${b.statsBudget}</span
            >
          </div>
          <ul class="cq-statlist">
            ${STATS.map((st) => {
              const v = p.stats[st];
              return html`<li>
                <div class="cq-stat-row">
                  <span class="cq-stat-name">${ATTRIBUTE_NAMES[st]}</span>
                  <button
                    class="cq-step-btn"
                    aria-label="Lower ${ATTRIBUTE_NAMES[st]}"
                    ?disabled=${v <= LIFE_STAT_MIN}
                    @click=${() =>
                      this.set({ stats: { ...p.stats, [st]: v - 1 } })}
                  >
                    −
                  </button>
                  <span class="cq-stat-n">${v}</span>
                  <button
                    class="cq-step-btn"
                    aria-label="Raise ${ATTRIBUTE_NAMES[st]}"
                    ?disabled=${v >= LIFE_STAT_MAX || statLeft <= 0}
                    @click=${() =>
                      this.set({ stats: { ...p.stats, [st]: v + 1 } })}
                  >
                    +
                  </button>
                </div>
                <p class="cq-stat-help">${ATTRIBUTE_HELP[st]}</p>
              </li>`;
            })}
          </ul>
          <p class="cq-muted small">
            Everyone starts at 5. Lowering one gives a point back; older
            characters have a point or two more.
          </p>
        </div>
        <div>
          <div
            class="cq-points ${skillLeft < 0 ? "over" : ""}"
            aria-live="polite"
          >
            <span class="cq-points-n">${skillLeft}</span>
            <span
              >skill point${skillLeft === 1 ? "" : "s"} left of
              ${b.skillsBudget}</span
            >
          </div>
          <ul class="cq-skill-ledger">
            ${SKILLS.map((sk) => {
              const v = start[sk];
              const bought = p.skills[sk] ?? 0;
              const from = BASE_SKILL + (bg.skills[sk] ?? 0);
              const next = skillStepCost(v);
              return html`<li title=${SKILL_HELP[sk]}>
                <span class="cq-stat-name">${SKILL_NAMES[sk]}</span>
                <span class="cq-skill-from"
                  >${from > BASE_SKILL
                    ? `${bg.name.toLowerCase()} ${from}`
                    : ""}</span
                >
                <button
                  class="cq-step-btn"
                  aria-label="Lower ${SKILL_NAMES[sk]}"
                  ?disabled=${bought <= 0}
                  @click=${() =>
                    this.set({ skills: { ...p.skills, [sk]: bought - 1 } })}
                >
                  −
                </button>
                <span class="cq-stat-n">${v}</span>
                <button
                  class="cq-step-btn"
                  aria-label="Raise ${SKILL_NAMES[sk]}"
                  title="Next point costs ${next}"
                  ?disabled=${v >= START_SKILL_MAX || next > skillLeft}
                  @click=${() =>
                    this.set({ skills: { ...p.skills, [sk]: bought + 1 } })}
                >
                  +
                </button>
              </li>`;
            })}
          </ul>
          <p class="cq-muted small">
            Skills over 7 cost 2 points each. They grow by doing: work,
            practice, and the choices you make.
          </p>
        </div>
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------- VI. traits

  private traitsSection(): TemplateResult {
    const p = this.plan!;
    const b = planBudget(p);
    const left = b.traitsBudget - b.traitsUsed;
    return html`<div class="cq-maker-part">
      <div class="cq-trait-headrow">
        ${this.head("VI", "What you're like", () => this.set(rollTraits(p)))}
        <div
          class="cq-points small ${left < 0 ? "over" : ""}"
          aria-live="polite"
        >
          <span class="cq-points-n">${left}</span>
          <span
            >trait point${left === 1 ? "" : "s"} left of ${b.traitsBudget}</span
          >
        </div>
      </div>
      <p class="cq-muted small">
        Up to ${LIFE_MAX_TRAITS}. A flaw gives points back. Others (scarred,
        famous, a drunkard...) are earned along the way.
      </p>
      <ul class="cq-trait-grid">
        ${CREATION_TRAITS.map((t) => {
          const r = TRAITS[t];
          const on = p.traits.includes(t);
          const clash = r.opposite && p.traits.includes(r.opposite);
          const full = !on && p.traits.length >= LIFE_MAX_TRAITS;
          const dear = !on && r.cost > left;
          const why = clash
            ? `Can't be ${r.name.toLowerCase()} and ${TRAITS[r.opposite!].name.toLowerCase()}`
            : full
              ? `Up to ${LIFE_MAX_TRAITS} traits`
              : dear
                ? "Not enough points: take a flaw to afford it"
                : "";
          return html`<li>
            <button
              class="cq-trait-pick ${on ? "on" : ""} ${r.cost < 0
                ? "flaw"
                : ""}"
              aria-pressed=${on}
              ?disabled=${!on && (!!clash || full || dear)}
              title=${why}
              @click=${() =>
                this.set({
                  traits: on
                    ? p.traits.filter((x) => x !== t)
                    : [...p.traits, t],
                })}
            >
              <span class="cq-trait-head"
                ><b>${r.name}</b
                ><span class="cq-trait-cost"
                  >${r.cost > 0
                    ? `costs ${r.cost}`
                    : r.cost < 0
                      ? `gives ${-r.cost}`
                      : "free"}</span
                ></span
              >
              <span class="cq-trait-text">${LIFE_TRAIT_TEXT[t]}</span>
            </button>
          </li>`;
        })}
      </ul>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cq-maker": Maker;
  }
}
