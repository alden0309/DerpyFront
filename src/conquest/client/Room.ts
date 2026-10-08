// Before the game: pick the crown you'll serve, then make the governor you'll
// be. Points are limited, so every strength is paid for somewhere else.

import { html, LitElement, nothing, PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "../../derpland/DerpBar";
import {
  planBudget,
  planCost,
  planProblem,
  planTraitCost,
} from "../engine/Characters";
import { AMERICAS } from "../engine/Map";
import { NAMES } from "../engine/Names";
import {
  AGE_CHOICES,
  MAX_TRAITS,
  POWER_RULES,
  STAT_MAX,
  STAT_MIN,
  STAT_NAMES,
  STAT_START,
  statStepCost,
  TRAIT_POINTS,
  TRAITS,
} from "../engine/Rules";
import type { GovernorPlan, Stat, TraitId } from "../engine/Types";
import { STATS } from "../engine/Types";
import type { ServerMessage } from "../Protocol";
import { flag } from "./Flags";
import { settingsFields } from "./Lobby";
import { Net } from "./Net";
import { nationVars } from "./Theme";

export type LobbyState = Extract<ServerMessage, { t: "lobby" }>;

const STAT_HELP: Record<Stat, string> = {
  dip: "Native nations' opinion of you, your court's loyalty, and pleading your case before the crown.",
  mar: "How hard your army fights when you lead it (+3% a point over 5).",
  ste: "How much land your officials can govern, how much tax comes in, and how little goes astray.",
  int: "Catching plots against you, and bribing your way out of trouble.",
  lea: "Fewer settlers and soldiers lost to tropical fever.",
};

const ALL_TRAITS = Object.keys(TRAITS) as TraitId[];
const draftKey = (power: string) => `derpy_conquest_governor_${power}`;

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function freshPlan(power: string, female = false): GovernorPlan {
  const names =
    NAMES[POWER_RULES[power]?.culture ?? "english"] ?? NAMES.english;
  return {
    first: pick(female ? names.female : names.male),
    family: pick(names.family),
    female,
    age: "prime",
    stats: {
      dip: STAT_START,
      mar: STAT_START,
      ste: STAT_START,
      int: STAT_START,
      lea: STAT_START,
    },
    traits: [],
  };
}

function loadDraft(power: string): GovernorPlan {
  try {
    const raw = localStorage.getItem(draftKey(power));
    if (raw) {
      const plan = JSON.parse(raw) as GovernorPlan;
      if (planProblem(plan) === null) return plan;
    }
  } catch {
    // ignore
  }
  return freshPlan(power);
}

/** Stat points left to spend on a plan. */
const pointsLeft = (p: GovernorPlan) => planBudget(p) - planCost(p);
/** Trait points left: traits have their own purse, so a strength can't be swapped for stat points. */
const traitsLeft = (p: GovernorPlan) => TRAIT_POINTS - planTraitCost(p);

/** A random governor that fits the budget: a couple of traits, the rest in stats. */
function randomPlan(base: GovernorPlan): GovernorPlan {
  const plan: GovernorPlan = {
    ...base,
    stats: { dip: 5, mar: 5, ste: 5, int: 5, lea: 5 },
    traits: [],
  };
  const wanted = 1 + Math.floor(Math.random() * 3);
  for (let tries = 0; plan.traits.length < wanted && tries < 30; tries++) {
    const t = pick(ALL_TRAITS);
    const opp = TRAITS[t].opposite;
    if (plan.traits.includes(t) || (opp && plan.traits.includes(opp))) continue;
    const next = { ...plan, traits: [...plan.traits, t] };
    if (traitsLeft(next) >= 0) plan.traits = next.traits;
  }
  // A weakness or two buys a strength.
  if (Math.random() < 0.6) plan.stats[pick([...STATS])] = 3;
  for (let tries = 0; tries < 60 && pointsLeft(plan) > 0; tries++) {
    const st = pick([...STATS]);
    const v = plan.stats[st];
    if (v >= 14 || statStepCost(v) > pointsLeft(plan)) continue;
    plan.stats[st] = v + 1;
  }
  return plan;
}

@customElement("cq-room")
export class Room extends LitElement {
  @property({ attribute: false }) net!: Net;
  @property({ attribute: false }) lobby!: LobbyState;

  @state() private plan: GovernorPlan | null = null;
  @state() private sent = "";
  @state() private copied = false;

  createRenderRoot() {
    return this;
  }

  private get me() {
    return this.lobby.seats.find((s) => s.id === this.lobby.you);
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (!changed.has("lobby")) return;
    const power = this.me?.power ?? null;
    if (!power) {
      this.plan = null;
      return;
    }
    if (!this.plan || this.planPower !== power) {
      this.plan = loadDraft(power);
      this.planPower = power;
      this.scrollToGovernor = true;
      this.sent = this.me?.governor ? this.sent : "";
    }
  }

  private planPower: string | null = null;
  private scrollToGovernor = false;

  protected updated(): void {
    if (!this.scrollToGovernor) return;
    this.scrollToGovernor = false;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    this.querySelector(".cq-governor")?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
  }

  private setPlan(p: GovernorPlan): void {
    this.plan = p;
    try {
      if (this.planPower)
        localStorage.setItem(draftKey(this.planPower), JSON.stringify(p));
    } catch {
      // ignore
    }
  }

  private swearIn(): void {
    if (!this.plan || planProblem(this.plan)) return;
    this.net.send({ t: "governor", plan: this.plan });
    this.sent = JSON.stringify(this.plan);
  }

  private leave(): void {
    this.net.leave();
    this.dispatchEvent(new CustomEvent("cq-leave", { bubbles: true }));
  }

  render(): TemplateResult {
    const L = this.lobby;
    const me = this.me;
    const power = me?.power ?? null;
    const p = power ? AMERICAS.powers.find((x) => x.id === power) : undefined;
    const style = p ? nationVars(p.color) : "";
    return html`<div
      class="cq-lobby cq-room ${p ? "themed" : ""}"
      style=${style}
    >
      <derp-bar page="conquest"></derp-bar>
      <div class="cq-lobby-page">
        <header class="cq-room-head">
          <div>
            <h1 class="cq-title small">
              ${L.solo
                ? "A new game"
                : html`Game room <span class="cq-code">${L.code}</span>`}
            </h1>
            <p class="cq-muted">
              ${L.solo
                ? "Choose the crown you'll serve, then the governor you'll be."
                : html`Up to five players, one nation each. Nations nobody picks
                  are played by the computer.
                  ${L.open
                    ? "Listed under open games."
                    : "Private: share the code."}`}
            </p>
          </div>
          <div class="cq-btnrow">
            ${!L.solo
              ? html`<button
                  class="cq-btn"
                  @click=${() => {
                    void navigator.clipboard
                      ?.writeText(`${location.origin}/conquest?join=${L.code}`)
                      .then(() => {
                        this.copied = true;
                        setTimeout(() => (this.copied = false), 2000);
                      });
                  }}
                >
                  ${this.copied ? "Link copied" : "Copy invite link"}
                </button>`
              : nothing}
            <button class="cq-btn quiet" @click=${() => this.leave()}>
              Leave
            </button>
          </div>
        </header>

        <div class="cq-room-grid">
          <div class="cq-room-main">
            <h2 class="cq-h2 step">
              <span class="cq-step">I</span> Choose your crown
            </h2>
            <ul class="cq-powers">
              ${AMERICAS.powers.map((x) =>
                this.powerCard(x.id, x.name, x.color, x.provinces),
              )}
            </ul>
            ${this.plan && power ? this.governorForm(power) : nothing}
          </div>
          <aside class="cq-room-side">${this.side()}</aside>
        </div>
      </div>
    </div>`;
  }

  private powerCard(
    id: string,
    name: string,
    color: string,
    provinces: number[],
  ): TemplateResult {
    const L = this.lobby;
    const rules = POWER_RULES[id];
    const taken = L.seats.find((s) => s.power === id && s.id !== L.you);
    const mine = this.me?.power === id;
    const where = provinces.map((p) => AMERICAS.provinces[p].name);
    return html`<li
      class="cq-power ${mine ? "mine" : ""} ${taken ? "taken" : ""}"
      style=${nationVars(color)}
    >
      <div class="cq-power-top">
        ${flag(id, "cq-flag xl")}
        <div>
          <h3 class="cq-power-name">${name.replace(/^the /, "")}</h3>
          <p class="cq-power-where">${where.slice(0, 3).join(", ")}</p>
        </div>
      </div>
      <p class="cq-power-history">${rules.history}</p>
      <ul class="cq-procon">
        ${rules.pros.map((t) => html`<li class="pro">${t}</li>`)}
        ${rules.cons.map((t) => html`<li class="con">${t}</li>`)}
      </ul>
      ${taken
        ? html`<p class="cq-power-taken">${taken.name} governs here</p>`
        : mine
          ? html`<p class="cq-power-taken mine">You serve this crown</p>
              <button
                class="cq-play on"
                @click=${() => this.net.send({ t: "pick", power: null })}
              >
                Choose another
              </button>`
          : html`<button
              class="cq-play"
              @click=${() => this.net.send({ t: "pick", power: id })}
            >
              Play ${name.replace(/^the /, "the ")}
            </button>`}
    </li>`;
  }

  private governorForm(power: string): TemplateResult {
    const plan = this.plan!;
    const left = pointsLeft(plan);
    const tleft = traitsLeft(plan);
    const budget = planBudget(plan);
    const problem = planProblem(plan);
    const dirty = JSON.stringify(plan) !== this.sent;
    const sworn = this.me?.governor && !dirty;
    const names =
      NAMES[POWER_RULES[power]?.culture ?? "english"] ?? NAMES.english;
    const set = (patch: Partial<GovernorPlan>) =>
      this.setPlan({ ...plan, ...patch });
    const effective = (st: Stat) =>
      plan.stats[st] +
      plan.traits.reduce((m, t) => m + (TRAITS[t].stats[st] ?? 0), 0);
    return html`<section class="cq-governor">
      <h2 class="cq-h2 step">
        <span class="cq-step">II</span> Make your governor
      </h2>
      <p class="cq-muted">
        You'll be this person for the whole game, until they die and their heir
        takes over. ${budget} points for skills, and ${TRAIT_POINTS} for traits:
        a flaw gives trait points back.
      </p>
      <div class="cq-gov-grid">
        <div class="cq-gov-id">
          <div class="cq-name-row">
            <label class="cq-field">
              <span>First name</span>
              <input
                .value=${plan.first}
                maxlength="20"
                @input=${(e: Event) =>
                  set({ first: (e.target as HTMLInputElement).value })}
              />
            </label>
            <label class="cq-field">
              <span>Family</span>
              <input
                .value=${plan.family}
                maxlength="24"
                @input=${(e: Event) =>
                  set({ family: (e.target as HTMLInputElement).value })}
              />
            </label>
          </div>
          <button
            class="cq-link small"
            @click=${() =>
              set({
                first: pick(plan.female ? names.female : names.male),
                family: pick(names.family),
              })}
          >
            Another period name
          </button>
          <div class="cq-seg" role="radiogroup" aria-label="Sex">
            <button
              role="radio"
              aria-checked=${!plan.female}
              @click=${() =>
                set({
                  female: false,
                  first: plan.female ? pick(names.male) : plan.first,
                })}
            >
              Man
            </button>
            <button
              role="radio"
              aria-checked=${plan.female}
              @click=${() =>
                set({
                  female: true,
                  first: plan.female ? plan.first : pick(names.female),
                })}
            >
              Woman
            </button>
          </div>
          <div class="cq-seg col" role="radiogroup" aria-label="Age">
            ${(Object.keys(AGE_CHOICES) as GovernorPlan["age"][]).map(
              (a) =>
                html`<button
                  role="radio"
                  aria-checked=${plan.age === a}
                  @click=${() => set({ age: a })}
                >
                  ${AGE_CHOICES[a].label}<span
                    >${AGE_CHOICES[a].points
                      ? `+${AGE_CHOICES[a].points} points`
                      : "no extra points"}</span
                  >
                </button>`,
            )}
          </div>
          <p class="cq-muted small">
            Older governors bring experience (more points) but have fewer years
            left.
          </p>
        </div>

        <div class="cq-gov-stats">
          <div class="cq-points ${left < 0 ? "over" : ""}" aria-live="polite">
            <span class="cq-points-n">${left}</span>
            <span>skill point${left === 1 ? "" : "s"} left of ${budget}</span>
          </div>
          <ul class="cq-statlist">
            ${STATS.map((st) => {
              const v = plan.stats[st];
              const up = statStepCost(v);
              const eff = effective(st);
              return html`<li>
                <div class="cq-stat-row">
                  <span class="cq-stat-name">${STAT_NAMES[st]}</span>
                  <button
                    class="cq-step-btn"
                    aria-label="Lower ${STAT_NAMES[st]}"
                    ?disabled=${v <= STAT_MIN}
                    @click=${() =>
                      set({ stats: { ...plan.stats, [st]: v - 1 } })}
                  >
                    −
                  </button>
                  <span class="cq-stat-n"
                    >${v}${eff !== v
                      ? html`<small
                          >${eff > v ? "+" : "−"}${Math.abs(eff - v)}</small
                        >`
                      : nothing}</span
                  >
                  <button
                    class="cq-step-btn"
                    aria-label="Raise ${STAT_NAMES[st]}"
                    ?disabled=${v >= STAT_MAX || up > left}
                    title=${`Next point costs ${up}`}
                    @click=${() =>
                      set({ stats: { ...plan.stats, [st]: v + 1 } })}
                  >
                    +
                  </button>
                  <span class="cq-cost"
                    >${v < STAT_MAX ? `next: ${up}` : "max"}</span
                  >
                </div>
                <p class="cq-stat-help">${STAT_HELP[st]}</p>
              </li>`;
            })}
          </ul>
          <p class="cq-muted small">
            Points over 9 cost 2 each, over 13 cost 3. Dropping a stat below 5
            gives a point back for each step.
          </p>
        </div>
      </div>

      <div class="cq-trait-headrow">
        <h3 class="cq-h3">
          Traits <span class="cq-muted small">(up to ${MAX_TRAITS})</span>
        </h3>
        <div
          class="cq-points small ${tleft < 0 ? "over" : ""}"
          aria-live="polite"
        >
          <span class="cq-points-n">${tleft}</span>
          <span
            >trait point${tleft === 1 ? "" : "s"} left of ${TRAIT_POINTS}</span
          >
        </div>
      </div>
      <p class="cq-muted small">
        Traits shape what your governor does, not just their numbers: how the
        crown and natives see them, how they fight, and how they lead a party
        into the wilds.
      </p>
      <ul class="cq-trait-grid">
        ${ALL_TRAITS.map((t) => {
          const r = TRAITS[t];
          const on = plan.traits.includes(t);
          const clash = r.opposite && plan.traits.includes(r.opposite);
          const full = !on && plan.traits.length >= MAX_TRAITS;
          const dear = !on && r.cost > tleft;
          const why = clash
            ? `Can't be ${r.name.toLowerCase()} and ${TRAITS[r.opposite!].name.toLowerCase()}`
            : full
              ? `Up to ${MAX_TRAITS} traits`
              : dear
                ? "Not enough trait points: take a flaw to afford it"
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
                set({
                  traits: on
                    ? plan.traits.filter((x) => x !== t)
                    : [...plan.traits, t],
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
              <span class="cq-trait-text">${r.text}</span>
              ${r.trail
                ? html`<span class="cq-trait-trail"
                    ><i>In the wilds:</i> ${r.trail}</span
                  >`
                : nothing}
            </button>
          </li>`;
        })}
      </ul>

      <div class="cq-gov-foot">
        <button
          class="cq-btn quiet"
          @click=${() => this.setPlan(randomPlan(plan))}
        >
          Roll a random governor
        </button>
        ${problem ? html`<span class="cq-why">${problem}</span>` : nothing}
        ${sworn
          ? html`<span class="cq-sworn">Sworn in as governor</span>`
          : html`<button
              class="cq-btn primary"
              ?disabled=${!!problem}
              @click=${() => this.swearIn()}
            >
              ${this.me?.governor ? "Swear in the changes" : "Swear in"}
            </button>`}
      </div>
    </section>`;
  }

  private side(): TemplateResult {
    const L = this.lobby;
    const me = this.me;
    const host = L.host === L.you;
    const ready = me?.ready ?? false;
    const players = L.seats.filter((s) => s.power);
    const canStart =
      players.length > 0 &&
      players.every((s) => s.governor) &&
      (L.solo || players.every((s) => s.ready || s.id === L.host));
    return html`<div class="cq-sheet">
      ${!L.solo
        ? html`<h2 class="cq-h3">Players</h2>
            <ul class="cq-seats">
              ${L.seats.map(
                (s) =>
                  html`<li class=${s.online ? "" : "away"}>
                    ${s.power
                      ? flag(s.power, "cq-flag sm")
                      : html`<span class="cq-flag sm empty"></span>`}
                    <span class="cq-seat-name"
                      >${s.name}${s.id === L.host
                        ? html` <span class="cq-muted small">host</span>`
                        : nothing}</span
                    >
                    <span class="cq-seat-state">
                      ${!s.power
                        ? "choosing"
                        : !s.governor
                          ? "making a governor"
                          : s.ready || s.id === L.host
                            ? html`<b class="good">ready</b>`
                            : "not ready"}
                    </span>
                  </li>`,
              )}
            </ul>`
        : nothing}
      <h2 class="cq-h3">The game</h2>
      ${settingsFields(
        L.settings,
        (settings) => this.net.send({ t: "settings", settings, open: L.open }),
        host,
      )}
      ${host && !L.solo
        ? html`<label class="cq-check">
            <input
              type="checkbox"
              .checked=${L.open}
              @change=${(e: Event) =>
                this.net.send({
                  t: "settings",
                  settings: L.settings,
                  open: (e.target as HTMLInputElement).checked,
                })}
            />
            Listed under open games
          </label>`
        : nothing}
      <div class="cq-start">
        ${host
          ? html`<button
                class="cq-btn primary big"
                ?disabled=${!canStart}
                @click=${() => this.net.send({ t: "start" })}
              >
                Set sail
              </button>
              <p class="cq-muted small">
                ${!me?.power
                  ? "Choose a crown first."
                  : !me.governor
                    ? "Swear in your governor first."
                    : !canStart
                      ? "Waiting for everyone to be ready."
                      : L.solo
                        ? "The game starts paused so you can look around."
                        : "Everyone's ready."}
              </p>`
          : html`<button
                class="cq-btn ${ready ? "" : "primary"} big"
                ?disabled=${!me?.governor}
                @click=${() => this.net.send({ t: "ready", ready: !ready })}
              >
                ${ready ? "Not ready yet" : "I'm ready"}
              </button>
              <p class="cq-muted small">
                ${me?.governor
                  ? "The host starts the game when everyone's ready."
                  : "Choose a crown and swear in your governor."}
              </p>`}
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cq-room": Room;
  }
}
