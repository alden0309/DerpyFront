// PROFILE (r26): a player's badges on their page, and on your own page the
// section where you choose your picture and pin badges.
//
// Badges: every badge, grouped by game, the earned ones in colour with when
// they were earned, the rest dimmed with the line that says how to earn them
// (and how far along a counted one is). On your own page each earned badge
// can be pinned beside your name, three at most.

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { avatar } from "../derpland/Avatar";
import { badgeEmblem } from "../derpland/BadgeArt";
import {
  BADGE_BY_KEY,
  BADGE_GROUPS,
  BADGES,
  PIN_MAX,
  type PlayerBadges,
  TIER_NAMES,
} from "../derpland/Badges";
import { pinBadges } from "../derpland/ProfileApi";
import { shortDate } from "./format";
import "./looks.css";
import "./PicturePicker";
import type { DerpPicturePicker } from "./PicturePicker";

/** Fired (bubbling) when the player's pins change, so the page can show them. */
export const PINS_EVENT = "dl-pins";

function pinIcon(on: boolean): TemplateResult {
  return html`<svg
    class="dl-i"
    viewBox="0 0 24 24"
    fill=${on ? "currentColor" : "none"}
    stroke="currentColor"
    stroke-width="2"
    stroke-linejoin="round"
    stroke-linecap="round"
    aria-hidden="true"
  >
    <path d="M9 3.5h6l-1 5.5 3.5 3.5v1.5h-11v-1.5L10 9z" />
    <path d="M12 14v6.5" />
  </svg>`;
}

@customElement("dl-badges")
export class DerpBadges extends LitElement {
  @property({ attribute: false }) badges: PlayerBadges | null = null;
  /** Your own page: badges can be pinned. */
  @property({ type: Boolean }) mine = false;
  @state() private pinned: string[] | null = null;
  @state() private busy = false;
  @state() private msg: string | null = null;

  createRenderRoot() {
    return this;
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("badges")) this.pinned = this.badges?.pinned ?? [];
  }

  private async toggle(key: string): Promise<void> {
    const now = this.pinned ?? [];
    const next = now.includes(key)
      ? now.filter((k) => k !== key)
      : [...now, key].slice(0, PIN_MAX);
    this.busy = true;
    this.msg = null;
    try {
      this.pinned = await pinBadges(next);
      this.dispatchEvent(
        new CustomEvent(PINS_EVENT, { detail: this.pinned, bubbles: true }),
      );
    } catch {
      this.msg = "That didn't work. Try again.";
    }
    this.busy = false;
  }

  render(): TemplateResult | typeof nothing {
    const b = this.badges;
    if (!b) return nothing;
    const earned = new Map(b.earned.map((e) => [e.key, e.at]));
    const pinned = this.pinned ?? [];
    const full = pinned.length >= PIN_MAX;
    return html`<section
      class="dl-panel dl-badges"
      id="badges"
      aria-labelledby="dl-badges-h"
    >
      <div class="dl-badges-head">
        <h2 class="dl-h2" id="dl-badges-h">
          Badges
          <span class="dl-badges-count"
            >${earned.size} of ${BADGES.length}</span
          >
        </h2>
        ${this.mine
          ? html`<p class="dl-badges-note">
              Pin up to ${PIN_MAX} beside your name: they show on your page and
              in everyone's friends and online lists.
              <b>${pinned.length} of ${PIN_MAX} pinned.</b>
            </p>`
          : nothing}
        ${this.msg
          ? html`<p class="dl-badges-msg" role="alert">${this.msg}</p>`
          : nothing}
      </div>
      ${BADGE_GROUPS.map((g) => {
        const list = BADGES.filter((x) => x.group === g.id);
        const got = list.filter((x) => earned.has(x.key)).length;
        return html`<div class="dl-badge-group">
          <h3 class="dl-badge-group-h">
            ${g.name}<span>${got} of ${list.length}</span>
          </h3>
          <ul class="dl-badge-grid">
            ${list.map((def) => {
              const at = earned.get(def.key);
              const prog = b.progress[def.key];
              const isPinned = pinned.includes(def.key);
              return html`<li
                class="dl-badge ${at
                  ? "earned"
                  : "locked"} ${def.tier} ${isPinned ? "pinned" : ""}"
              >
                ${badgeEmblem(def.key, "dl-badge-emblem")}
                <span class="dl-badge-text">
                  <span class="dl-badge-name">${def.name}</span>
                  <span class="dl-badge-how">${def.how}</span>
                  <span class="dl-badge-meta">
                    ${at
                      ? html`${TIER_NAMES[def.tier]} · ${shortDate(at)}`
                      : prog
                        ? html`<span
                              class="dl-badge-bar"
                              role="progressbar"
                              aria-valuemin="0"
                              aria-valuemax=${prog[1]}
                              aria-valuenow=${prog[0]}
                              aria-label="${def.name}: ${prog[0]} of ${prog[1]}"
                              ><i
                                style="width:${Math.round(
                                  (prog[0] / prog[1]) * 100,
                                )}%"
                              ></i></span
                            >${prog[0]} of ${prog[1]}`
                        : TIER_NAMES[def.tier]}
                  </span>
                </span>
                ${this.mine && at
                  ? html`<button
                      class="dl-badge-pin ${isPinned ? "on" : ""}"
                      aria-pressed=${isPinned}
                      title=${isPinned
                        ? `Unpin ${def.name}`
                        : full
                          ? `You've pinned ${PIN_MAX}: unpin one first`
                          : `Pin ${def.name} beside your name`}
                      aria-label=${isPinned
                        ? `Unpin ${def.name}`
                        : `Pin ${def.name}`}
                      ?disabled=${this.busy || (!isPinned && full)}
                      @click=${() => void this.toggle(def.key)}
                    >
                      ${pinIcon(isPinned)}
                    </button>`
                  : nothing}
              </li>`;
            })}
          </ul>
        </div>`;
      })}
    </section>`;
  }
}

/**
 * Your own page's "Your picture and badges": the picture you wear (and the
 * button that changes it) and the badges you've pinned.
 */
@customElement("dl-looks-panel")
export class DerpLooksPanel extends LitElement {
  @property({ type: String }) username = "";
  @property({ attribute: false }) picture: string | null = null;
  @property({ attribute: false }) pinned: string[] = [];

  createRenderRoot() {
    return this;
  }

  /** Opens the picture picker. */
  open(tab: "presets" | "upload" = "presets"): void {
    void this.querySelector<DerpPicturePicker>("dl-picture-picker")?.open(tab);
  }

  render(): TemplateResult {
    const slots = Array.from({ length: PIN_MAX }, (_, i) => this.pinned[i]);
    return html`<section class="dl-panel dl-looks" aria-labelledby="dl-looks-h">
      <div class="dl-looks-pic">
        <button
          class="dl-looks-avatar"
          @click=${() => this.open()}
          aria-label="Change your picture"
        >
          ${avatar(this.username, this.picture, "dl-token huge")}
          <span class="dl-looks-edit" aria-hidden="true">Change</span>
        </button>
        <div class="dl-looks-text">
          <h2 class="dl-h2" id="dl-looks-h">Your picture and badges</h2>
          <p>
            Pick one of Derp Land's pictures or upload your own. It shows on
            your page, in the top bar, and in friends, online and party lists.
          </p>
          <div class="dl-row">
            <button class="dl-btn small" @click=${() => this.open("presets")}>
              Choose a picture
            </button>
            <button
              class="dl-btn small ghost"
              @click=${() => this.open("upload")}
            >
              Upload your own
            </button>
          </div>
        </div>
      </div>
      <div class="dl-looks-pins">
        <span class="dl-looks-label">Pinned beside your name</span>
        <span class="dl-looks-slots">
          ${slots.map((k) =>
            k && BADGE_BY_KEY.has(k)
              ? html`<span
                  class="dl-looks-slot full"
                  title=${BADGE_BY_KEY.get(k)!.name}
                  >${badgeEmblem(k, "dl-looks-slot-art")}</span
                >`
              : html`<span class="dl-looks-slot" aria-hidden="true"></span>`,
          )}
        </span>
        <a class="dl-looks-link" href="#badges">Pin badges from your list</a>
      </div>
      <dl-picture-picker
        .username=${this.username}
        .picture=${this.picture}
      ></dl-picture-picker>
    </section>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dl-badges": DerpBadges;
    "dl-looks-panel": DerpLooksPanel;
  }
}
