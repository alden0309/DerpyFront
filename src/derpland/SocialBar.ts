// FRIENDS (r25): the top bar's people and bell, for a signed-in player.
//
// People: who's on Derp Land now and where (friends first), with Join,
// Watch and Invite on each row, friend requests, adding a friend by name,
// and your party. The bell: game invites, party invites, the party leader's
// "come along", and friend requests, each also shown once as a toast.
//
// It lives inside the bar's shadow root, so it takes the bar's colors. The
// words come from `words` (DerpyFront passes its translations).

import { css, html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  addPersonIcon,
  bellIcon,
  closeIcon,
  eyeIcon,
  flagIcon,
  joinIcon,
  lockIcon,
  moreIcon,
  peopleIcon,
  tokenColor,
} from "./Icons";
import {
  defaultWhere,
  type Notice,
  OPEN_PEOPLE_EVENT,
  social,
  SOCIAL_EVENT,
} from "./Social";
import {
  englishSocial,
  placeText,
  placeTone,
  socialErrorText,
  type SocialTranslate,
} from "./SocialText";
import type { PersonRow, SocialState } from "./SocialTypes";

/** Opening one of the bar's menus closes the others (DerpBar listens too). */
export const BAR_MENU_EVENT = "derp-bar-menu";
export { OPEN_PEOPLE_EVENT };

const TOAST_MS = 12_000;

interface Toast {
  notice: Notice;
  at: number;
}

@customElement("derp-social")
export class DerpSocial extends LitElement {
  /** The bar's page, for where this page is until it says. */
  @property({ type: String }) page = "home";
  @property({ attribute: false }) words: SocialTranslate = englishSocial;

  @state() private s: SocialState | null = social.state;
  @state() private failed = false;
  @state() private menu: "people" | "bell" | null = null;
  @state() private expanded: number | null = null;
  @state() private toasts: Toast[] = [];
  @state() private addMsg: { ok: boolean; text: string } | null = null;
  @state() private rowMsg: { id: number; text: string } | null = null;
  @state() private invited = new Set<number>();
  @state() private busy = false;
  /** Asked "remove this friend?" (the second click removes). */
  @state() private removing: number | null = null;

  private timers: ReturnType<typeof setTimeout>[] = [];

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(SOCIAL_EVENT, this.onSocial);
    window.addEventListener(BAR_MENU_EVENT, this.onBarMenu);
    window.addEventListener(OPEN_PEOPLE_EVENT, this.onOpenPeople);
    document.addEventListener("pointerdown", this.onOutside);
    document.addEventListener("keydown", this.onKey);
    social.start(defaultWhere(this.page, location.pathname));
    this.onSocial();
  }

  disconnectedCallback(): void {
    window.removeEventListener(SOCIAL_EVENT, this.onSocial);
    window.removeEventListener(BAR_MENU_EVENT, this.onBarMenu);
    window.removeEventListener(OPEN_PEOPLE_EVENT, this.onOpenPeople);
    document.removeEventListener("pointerdown", this.onOutside);
    document.removeEventListener("keydown", this.onKey);
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    super.disconnectedCallback();
  }

  private t: SocialTranslate = (k, p) => this.words(k, p);

  private onSocial = () => {
    this.s = social.state;
    this.failed = social.failed;
    if (!this.s) return;
    // A toast whose notice has gone (the invite was used, its lobby closed,
    // you're there already) goes with it.
    const live = new Set(social.notices().map((n) => n.key));
    if (this.toasts.some((x) => !live.has(x.notice.key)))
      this.toasts = this.toasts.filter((x) => live.has(x.notice.key));
    // A toast for each thing this browser hasn't been shown yet (on any
    // page): it stays in the bell after.
    const recent = social.fresh();
    if (recent.length === 0) return;
    const now = Date.now();
    this.toasts = [
      ...this.toasts,
      ...recent.map((notice) => ({ notice, at: now })),
    ].slice(-3);
    const t = setTimeout(() => {
      this.toasts = this.toasts.filter((x) => Date.now() - x.at < TOAST_MS);
    }, TOAST_MS + 50);
    this.timers.push(t);
  };

  private onOpenPeople = () => {
    // After the menu's own click is done (it would close this again).
    setTimeout(() => {
      if (this.menu !== "people") this.toggle("people");
    }, 0);
  };

  private onBarMenu = (e: Event) => {
    if ((e as CustomEvent).detail !== "social") this.menu = null;
  };

  private onOutside = (e: PointerEvent) => {
    if (this.menu === null) return;
    const inside = e
      .composedPath()
      .some((n) => n instanceof HTMLElement && n.dataset.menu === this.menu);
    if (!inside) this.menu = null;
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.menu !== null) this.menu = null;
  };

  private toggle(menu: "people" | "bell"): void {
    this.menu = this.menu === menu ? null : menu;
    if (this.menu) {
      window.dispatchEvent(
        new CustomEvent(BAR_MENU_EVENT, { detail: "social" }),
      );
      // Opening the list asks for it fresh.
      social.refresh();
    }
    this.addMsg = null;
  }

  private async act(
    path: string,
    body: object = {},
    rowId?: number,
  ): Promise<boolean> {
    this.busy = true;
    const err = await social.act(path, body);
    this.busy = false;
    if (err && rowId !== undefined)
      this.rowMsg = { id: rowId, text: socialErrorText(err, this.t) };
    return err === null;
  }

  private async addFriend(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const name = String(new FormData(form).get("username") ?? "").trim();
    if (!name) return;
    this.busy = true;
    const err = await social.act("/friends/request", { username: name });
    this.busy = false;
    if (err) {
      this.addMsg = { ok: false, text: socialErrorText(err, this.t) };
      return;
    }
    form.reset();
    const friend = social.state?.friends.some(
      (f) => f.username.toLowerCase() === name.toLowerCase(),
    );
    this.addMsg = {
      ok: true,
      text: this.t(friend ? "now_friends" : "request_sent", { name }),
    };
  }

  private async invite(r: PersonRow): Promise<void> {
    if (await this.act("/invite", { id: r.id }, r.id)) {
      this.invited = new Set([...this.invited, r.id]);
      const t = setTimeout(() => {
        const next = new Set(this.invited);
        next.delete(r.id);
        this.invited = next;
      }, 15_000);
      this.timers.push(t);
    }
  }

  // ---------------------------------------------------------------- render

  render(): TemplateResult {
    const s = this.s;
    const t = this.t;
    const notices = social.notices();
    const party = s?.party ?? null;
    const others = s?.online.length ?? 0;
    return html`
      <div class="wrap" data-menu="people">
        <button
          class="ibtn people ${party ? "partied" : ""}"
          aria-haspopup="dialog"
          aria-expanded=${this.menu === "people"}
          aria-label=${party ? t("people_and_party") : t("people")}
          title=${party ? t("people_and_party") : t("people")}
          @click=${() => this.toggle("people")}
        >
          ${party
            ? html`${this.stack(party.members.map((m) => m.username))}<span
                  class="phone-icon"
                  >${peopleIcon()}<span class="flag-badge"
                    >${flagIcon("dl-i")}</span
                  ></span
                >`
            : peopleIcon()}
          ${others > 0
            ? html`<span class="count" aria-hidden="true">${others}</span>`
            : nothing}
          ${notices.length > 0
            ? html`<span class="dot-note" aria-hidden="true"></span>`
            : nothing}
        </button>
        ${this.menu === "people" ? this.renderPeople(notices) : nothing}
      </div>
      <div class="wrap bellwrap" data-menu="bell">
        <button
          class="ibtn bell"
          aria-haspopup="dialog"
          aria-expanded=${this.menu === "bell"}
          aria-label=${t("notifications")}
          title=${t("notifications")}
          @click=${() => this.toggle("bell")}
        >
          ${bellIcon()}
          ${notices.length > 0
            ? html`<span class="badge">${notices.length}</span>`
            : nothing}
        </button>
        ${this.menu === "bell" ? this.renderBell(notices) : nothing}
      </div>
      ${this.toasts.length
        ? html`<div class="toasts" role="status" aria-live="polite">
            ${this.toasts.map(
              (x) =>
                html`<div class="toast">
                  ${this.renderNotice(x.notice, true)}
                  <button
                    class="x"
                    aria-label=${t("dismiss")}
                    @click=${() =>
                      (this.toasts = this.toasts.filter((y) => y !== x))}
                  >
                    ${closeIcon()}
                  </button>
                </div>`,
            )}
          </div>`
        : nothing}
    `;
  }

  private closeButton(): TemplateResult {
    return html`<button
      class="x ph-x"
      aria-label=${this.t("dismiss")}
      @click=${() => (this.menu = null)}
    >
      ${closeIcon()}
    </button>`;
  }

  /** A few overlapping tokens: the party, in the bar. */
  private stack(names: string[]): TemplateResult {
    const shown = names.slice(0, 3);
    return html`<span class="stack" aria-hidden="true"
      >${flagIcon("dl-i flag")}${shown.map(
        (n) =>
          html`<span class="mini" style="--token:${tokenColor(n)}"
            >${n.slice(0, 1).toUpperCase()}</span
          >`,
      )}</span
    >`;
  }

  private token(name: string, cls = "tok"): TemplateResult {
    return html`<a
      class=${cls}
      href="/player/${encodeURIComponent(name)}"
      style="--token:${tokenColor(name)}"
      tabindex="-1"
      aria-hidden="true"
      >${name.slice(0, 1).toUpperCase()}</a
    >`;
  }

  private where(row: { place: PersonRow["place"] }): TemplateResult {
    return html`<span class="where"
      ><i class="dot ${placeTone(row.place)}"></i
      ><span>${placeText(row.place, this.t)}</span>${row.place?.locked
        ? lockIcon(this.t("locked"), "lock")
        : nothing}</span
    >`;
  }

  private renderPeople(notices: Notice[]): TemplateResult {
    const t = this.t;
    const s = this.s;
    if (!s)
      return html`<div class="panel people-panel" role="dialog">
        <p class="quiet">${this.failed ? t("unavailable") : "…"}</p>
      </div>`;
    const friends = s.online.filter((r) => r.friend);
    const others = s.online.filter((r) => !r.friend);
    const offline = s.friends.filter((f) => !f.place);
    return html`<div
      class="panel people-panel"
      role="dialog"
      aria-label=${t("people")}
    >
      <header class="ph">
        <b>${t("people")}</b>
        ${this.closeButton()}
        <span class="me"
          >${s.me.appearOffline
            ? t("you_offline")
            : t("you_are", { place: placeText(s.me.place, t) })}</span
        >
      </header>
      ${notices.length
        ? html`<section class="sec notes-narrow">
            <ul class="notes">
              ${notices.map(
                (n) => html`<li class="note">${this.renderNotice(n)}</li>`,
              )}
            </ul>
          </section>`
        : nothing}
      ${this.renderParty(s)}
      <section class="sec">
        <h3>
          ${t("online_title")}
          <span class="n">${s.online.length}</span>
        </h3>
        ${s.online.length === 0
          ? html`<p class="quiet">${t("nobody_online")}</p>`
          : nothing}
        ${friends.length
          ? html`<h4>${t("friends_heading")}</h4>
              <ul class="rows">
                ${friends.map((r) => this.renderRow(r))}
              </ul>`
          : nothing}
        ${others.length
          ? html`${friends.length
                ? html`<h4>${t("others_heading")}</h4>`
                : nothing}
              <ul class="rows">
                ${others.map((r) => this.renderRow(r))}
              </ul>`
          : nothing}
      </section>
      ${offline.length || s.requests.outgoing.length
        ? html`<details class="sec offline">
            <summary>
              ${t("offline_friends")}
              <span class="n">${offline.length}</span>
            </summary>
            <ul class="rows">
              ${offline.map((r) => this.renderRow(r))}
              ${s.requests.outgoing.map(
                (r) =>
                  html`<li class="row">
                    ${this.token(r.username)}
                    <div class="who">
                      <span class="nameline"
                        ><span class="name">${r.username}</span></span
                      >
                      <span class="where"
                        >${t("waiting_on", { name: r.username })}</span
                      >
                    </div>
                    <div class="acts">
                      <button
                        class="btn ghost"
                        ?disabled=${this.busy}
                        @click=${() =>
                          void this.act("/friends/cancel", { id: r.id })}
                      >
                        ${t("cancel")}
                      </button>
                    </div>
                  </li>`,
              )}
            </ul>
          </details>`
        : nothing}
      ${s.friends.length === 0 && s.requests.outgoing.length === 0
        ? html`<p class="quiet pad">${t("no_friends_yet")}</p>`
        : nothing}
      <form class="add" @submit=${(e: SubmitEvent) => this.addFriend(e)}>
        <label for="dl-add-friend">${t("add_friend_label")}</label>
        <div class="add-row">
          <input
            id="dl-add-friend"
            name="username"
            autocomplete="off"
            spellcheck="false"
            maxlength="20"
            placeholder=${t("username")}
            required
          />
          <button class="btn" ?disabled=${this.busy}>
            ${addPersonIcon()} ${t("add")}
          </button>
        </div>
        ${this.addMsg
          ? html`<p class="msg ${this.addMsg.ok ? "ok" : "bad"}" role="status">
              ${this.addMsg.text}
            </p>`
          : nothing}
      </form>
    </div>`;
  }

  private renderParty(s: SocialState): TemplateResult {
    const t = this.t;
    const p = s.party;
    if (!p) {
      return html`<section class="sec party none">
        <button
          class="btn ghost small"
          title=${t("party_blurb")}
          ?disabled=${this.busy}
          @click=${() => void this.act("/party/create")}
        >
          ${flagIcon()} ${t("start_party")}
        </button>
      </section>`;
    }
    return html`<section class="sec party">
      <h3>
        ${flagIcon()} ${t("party_title")}
        <span class="n"
          >${t("party_count", { count: p.members.length, max: p.max })}</span
        >
        <span class="push"></span>
        <button
          class="btn ghost small"
          title=${p.leading && p.members.length > 1
            ? t("leave_hands_over")
            : ""}
          ?disabled=${this.busy}
          @click=${() => void this.act("/party/leave")}
        >
          ${t("leave_party")}
        </button>
        ${p.leading && p.members.length > 1
          ? html`<button
              class="btn ghost small danger"
              ?disabled=${this.busy}
              @click=${() => void this.act("/party/disband")}
            >
              ${t("disband")}
            </button>`
          : nothing}
      </h3>
      <ul class="rows">
        ${p.members.map(
          (m) =>
            html`<li class="row">
              ${this.token(m.username)}
              <div class="who">
                <span class="nameline"
                  ><span class="name">${m.username}</span>${m.leader
                    ? html`<span class="tag lead">${t("party_leader")}</span>`
                    : nothing}</span
                >
                ${this.where(m)}
              </div>
              <div class="acts">
                ${p.leading && !m.leader
                  ? html`<button
                      class="btn ghost small"
                      ?disabled=${this.busy}
                      @click=${() => void this.act("/party/lead", { id: m.id })}
                    >
                      ${t("make_leader")}
                    </button>`
                  : nothing}
              </div>
            </li>`,
        )}
      </ul>
      ${p.invited.length
        ? html`<p class="hint pad">
            ${t("party_asked", {
              names: p.invited.map((x) => x.username).join(", "),
            })}
          </p>`
        : nothing}
      <p class="hint pad">${t("party_blurb")}</p>
    </section>`;
  }

  private renderRow(r: PersonRow): TemplateResult {
    const t = this.t;
    const s = this.s!;
    const open = this.expanded === r.id;
    const canInvite = s.me.canInvite && !!r.place && !r.join;
    const party = s.party;
    const canParty =
      r.friend &&
      !r.inParty &&
      (!party || party.leading) &&
      !(party?.invited.some((x) => x.id === r.id) ?? false);
    const invited = this.invited.has(r.id);
    const primary = r.join
      ? html`<button
          class="btn go"
          @click=${() => void social.go(r.join!)}
          aria-label="${t("join")} ${r.username}"
        >
          ${joinIcon()} ${t("join")}
        </button>`
      : r.watch
        ? html`<button
            class="btn"
            @click=${() => void social.go(r.watch!)}
            aria-label="${t("watch")} ${r.username}"
          >
            ${eyeIcon()} ${t("watch")}
          </button>`
        : canInvite
          ? html`<button
              class="btn"
              title=${t("invite")}
              aria-label="${t("invite")}: ${r.username}"
              ?disabled=${invited || this.busy}
              @click=${() => void this.invite(r)}
            >
              ${invited ? t("invited") : t("invite_short")}
            </button>`
          : nothing;
    return html`<li class="row ${open ? "open" : ""}">
      ${this.token(r.username)}
      <div class="who">
        <span class="nameline"
          ><a class="name" href="/player/${encodeURIComponent(r.username)}"
            >${r.username}</a
          >${r.inParty
            ? html`<span class="tag">${t("party_tag")}</span>`
            : nothing}</span
        >
        ${this.where(r)}
      </div>
      <div class="acts">
        ${primary}
        <button
          class="more"
          aria-expanded=${open}
          aria-label=${t("more", { name: r.username })}
          title=${t("more", { name: r.username })}
          @click=${() => {
            this.expanded = open ? null : r.id;
            this.rowMsg = null;
            this.removing = null;
          }}
        >
          ${moreIcon()}
        </button>
      </div>
      ${open
        ? html`<div class="extra">
            ${canInvite && (r.join || r.watch)
              ? html`<button
                  class="btn ghost small"
                  ?disabled=${invited || this.busy}
                  @click=${() => void this.invite(r)}
                >
                  ${invited ? t("invited") : t("invite")}
                </button>`
              : nothing}
            ${canParty
              ? html`<button
                  class="btn ghost small"
                  ?disabled=${this.busy}
                  @click=${() =>
                    void this.act("/party/invite", { id: r.id }, r.id)}
                >
                  ${flagIcon()} ${t("invite_to_party")}
                </button>`
              : nothing}
            ${r.friend
              ? this.removing === r.id
                ? html`<button
                    class="btn small danger-solid"
                    ?disabled=${this.busy}
                    @click=${() => {
                      this.removing = null;
                      void this.act("/friends/remove", { id: r.id }, r.id);
                    }}
                  >
                    ${t("remove_sure", { name: r.username })}
                  </button>`
                : html`<button
                    class="btn ghost small danger"
                    ?disabled=${this.busy}
                    @click=${() => (this.removing = r.id)}
                  >
                    ${t("remove_friend")}
                  </button>`
              : r.requested === "in"
                ? html`<button
                    class="btn ghost small"
                    ?disabled=${this.busy}
                    @click=${() =>
                      void this.act("/friends/accept", { id: r.id }, r.id)}
                  >
                    ${t("accept_request")}
                  </button>`
                : r.requested === "out"
                  ? html`<span class="hint">${t("request_sent_short")}</span>`
                  : html`<button
                      class="btn ghost small"
                      ?disabled=${this.busy}
                      @click=${() =>
                        void this.act(
                          "/friends/request",
                          { username: r.username },
                          r.id,
                        )}
                    >
                      ${addPersonIcon()} ${t("add_friend")}
                    </button>`}
            <a
              class="btn ghost small"
              href="/player/${encodeURIComponent(r.username)}"
              >${t("profile")}</a
            >
            ${this.rowMsg?.id === r.id
              ? html`<p class="msg bad">${this.rowMsg.text}</p>`
              : nothing}
          </div>`
        : nothing}
    </li>`;
  }

  private renderBell(notices: Notice[]): TemplateResult {
    const t = this.t;
    return html`<div
      class="panel bell-panel"
      role="dialog"
      aria-label=${t("notifications")}
    >
      <header class="ph">
        <b>${t("notifications")}</b>${this.closeButton()}
      </header>
      ${notices.length === 0
        ? html`<p class="quiet pad">${t("nothing_new")}</p>`
        : html`<ul class="notes">
            ${notices.map(
              (n) => html`<li class="note">${this.renderNotice(n)}</li>`,
            )}
          </ul>`}
    </div>`;
  }

  private renderNotice(n: Notice, toast = false): TemplateResult {
    const t = this.t;
    const done = () => {
      if (toast)
        this.toasts = this.toasts.filter((x) => x.notice.key !== n.key);
    };
    const button = (
      label: string,
      fn: () => unknown,
      cls = "btn",
      icon: TemplateResult | typeof nothing = nothing,
    ) =>
      html`<button
        class=${cls}
        ?disabled=${this.busy}
        @click=${() => {
          done();
          void fn();
        }}
      >
        ${icon} ${label}
      </button>`;
    let text: string;
    let actions: TemplateResult;
    let who: string;
    switch (n.kind) {
      case "invite":
        who = n.from;
        text = t(n.game === "conquest" ? "invite_cq" : "invite_df", {
          name: n.from,
        });
        actions = html`${button(
          t("join"),
          () => social.go(n.href, n.id),
          "btn go",
          joinIcon(),
        )}
        ${button(
          t("dismiss"),
          () => this.act("/invite/close", { id: n.id }),
          "btn ghost",
        )}`;
        break;
      case "party":
        who = n.from;
        text = t("party_invite", { name: n.from, count: n.count, max: n.max });
        actions = html`${button(
          t("join_party"),
          () => this.act("/party/accept", { id: n.partyId }),
          "btn go",
          flagIcon(),
        )}
        ${button(
          t("decline"),
          () => this.act("/party/decline", { id: n.partyId }),
          "btn ghost",
        )}`;
        break;
      case "pull":
        who = n.leader;
        text = t(n.game === "conquest" ? "pull_cq" : "pull_df", {
          name: n.leader,
        });
        actions = html`${button(
          t("follow"),
          () => social.go(n.href),
          "btn go",
          joinIcon(),
        )}
        ${button(t("not_now"), () => social.notNowTo(n.key), "btn ghost")}`;
        break;
      case "request":
        who = n.from;
        text = t("wants_friends", { name: n.from });
        actions = html`${button(
          t("accept"),
          () => this.act("/friends/accept", { id: n.id }),
          "btn go",
        )}
        ${button(
          t("decline"),
          () => this.act("/friends/decline", { id: n.id }),
          "btn ghost",
        )}`;
        break;
    }
    return html`<div class="notice ${n.kind}">
      ${this.token(who, "tok sm")}
      <div class="notice-body">
        <p>${text}</p>
        <div class="notice-acts">${actions}</div>
      </div>
    </div>`;
  }

  static styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    * {
      box-sizing: border-box;
    }
    a {
      color: inherit;
    }
    .wrap {
      position: relative;
    }
    /* The buttons' look can be set from outside (Derpy Conquest's banner). */
    .ibtn {
      position: relative;
      display: grid;
      place-items: center;
      min-width: var(--soc-btn-size, 36px);
      height: var(--soc-btn-size, 36px);
      padding: 0 7px;
      border: 0;
      border-radius: var(--soc-btn-radius, 9px);
      background: var(--soc-btn-bg, rgba(255, 255, 255, 0.06));
      color: var(--soc-btn-ink, var(--text));
      cursor: pointer;
      font: inherit;
    }
    .ibtn:hover,
    .ibtn[aria-expanded="true"] {
      background: var(--soc-btn-hover, rgba(255, 255, 255, 0.12));
    }
    .ibtn:focus-visible,
    .btn:focus-visible,
    .more:focus-visible,
    .name:focus-visible,
    summary:focus-visible,
    input:focus-visible {
      outline: 2px solid var(--accent-2);
      outline-offset: 2px;
    }
    .dl-i {
      width: 18px;
      height: 18px;
      flex: none;
    }
    .ibtn .dl-i {
      width: 20px;
      height: 20px;
      opacity: 0.9;
    }
    .count {
      position: absolute;
      right: -5px;
      bottom: -4px;
      min-width: 17px;
      height: 17px;
      padding: 0 4px;
      border-radius: 9px;
      background: #2f7d4f;
      color: #fff;
      font-size: 11px;
      font-weight: 750;
      line-height: 17px;
      text-align: center;
      font-variant-numeric: tabular-nums;
      box-shadow: 0 0 0 2px var(--bar);
    }
    .dot-note {
      display: none;
      position: absolute;
      top: -2px;
      right: -2px;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #ef5a3c;
      box-shadow: 0 0 0 2px var(--bar);
    }
    .badge {
      position: absolute;
      top: -5px;
      right: -5px;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 9px;
      background: #ef5a3c;
      color: #fff;
      font-size: 11px;
      font-weight: 750;
      line-height: 18px;
      text-align: center;
      box-shadow: 0 0 0 2px var(--bar);
    }
    .stack {
      display: flex;
      align-items: center;
    }
    .stack .flag {
      width: 16px;
      height: 16px;
      margin-right: 3px;
      color: var(--accent-2);
    }
    .mini {
      width: 22px;
      height: 22px;
      margin-left: -6px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--token);
      color: #fff;
      font-size: 11px;
      font-weight: 750;
      box-shadow: 0 0 0 2px #2a2a30;
    }
    .mini:first-of-type {
      margin-left: 0;
    }
    .phone-icon {
      display: none;
      position: relative;
    }
    .flag-badge {
      position: absolute;
      left: -9px;
      top: -9px;
      width: 15px;
      height: 15px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--accent);
      color: var(--accent-ink);
      box-shadow: 0 0 0 2px var(--bar);
    }
    .ibtn .flag-badge .dl-i {
      width: 10px;
      height: 10px;
      opacity: 1;
    }

    .panel {
      position: absolute;
      top: calc(100% + 12px);
      right: -4px;
      width: 380px;
      max-height: min(680px, calc(100vh - 86px));
      overflow: auto;
      overscroll-behavior: contain;
      background: var(--panel);
      color: var(--text);
      border: 1px solid var(--line);
      border-radius: 10px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
      padding: 4px 0 6px;
      z-index: 2;
    }
    .bell-panel {
      width: 340px;
    }
    .ph {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 10px 44px 10px 14px;
      border-bottom: 1px solid var(--line);
    }
    .ph-x {
      position: absolute;
      top: 8px;
      right: 8px;
      border: 0;
      background: none;
      color: var(--text-2);
      padding: 5px;
      border-radius: 6px;
      cursor: pointer;
      display: grid;
    }
    .ph-x:hover {
      color: var(--text);
      background: var(--panel-2);
    }
    .ph-x .dl-i {
      width: 16px;
      height: 16px;
    }
    .ph b {
      font-size: 16px;
      font-weight: 720;
    }
    .me {
      font-size: 13px;
      color: var(--text-2);
    }
    .sec {
      padding: 10px 8px 6px;
      border-bottom: 1px solid var(--line);
    }
    .sec:last-of-type {
      border-bottom: 0;
    }
    h3 {
      display: flex;
      align-items: center;
      gap: 7px;
      margin: 0 6px 6px;
      font-size: 12.5px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-2);
    }
    h3 .dl-i {
      width: 15px;
      height: 15px;
      color: var(--accent-2);
    }
    h4 {
      margin: 8px 6px 2px;
      font-size: 12px;
      font-weight: 650;
      color: var(--text-2);
    }
    .n {
      font-weight: 650;
      color: var(--text-2);
      font-variant-numeric: tabular-nums;
      text-transform: none;
      letter-spacing: 0;
    }
    .push {
      margin-left: auto;
    }
    .rows,
    .notes {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .row {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) auto;
      align-items: center;
      gap: 4px 10px;
      padding: 6px;
      border-radius: 8px;
    }
    .row:hover,
    .row.open {
      background: var(--panel-2);
    }
    .tok {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--token);
      color: #fff;
      font-weight: 700;
      font-size: 14px;
      text-decoration: none;
    }
    .tok.sm {
      width: 30px;
      height: 30px;
      font-size: 13px;
    }
    .who {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
    }
    .nameline {
      display: flex;
      align-items: center;
      min-width: 0;
    }
    .name {
      font-weight: 650;
      font-size: 14.5px;
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    a.name:hover {
      text-decoration: underline;
    }
    .tag {
      flex: none;
      display: inline-block;
      margin-left: 6px;
      padding: 1px 6px;
      border-radius: 5px;
      background: rgba(255, 255, 255, 0.08);
      font-size: 11px;
      font-weight: 650;
      color: var(--text-2);
      vertical-align: 1px;
    }
    .tag.lead {
      background: color-mix(in srgb, var(--accent) 22%, transparent);
      color: var(--accent-2);
    }
    .where {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12.5px;
      line-height: 1.35;
      color: var(--text-2);
      min-width: 0;
    }
    .where span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .where .lock {
      width: 12px;
      height: 12px;
      flex: none;
      color: var(--accent-2);
    }
    .dot {
      width: 8px;
      height: 8px;
      flex: none;
      border-radius: 50%;
      background: #52525b;
    }
    .dot.play {
      background: #4ade80;
    }
    .dot.lobby {
      background: #fbbf24;
    }
    .dot.about {
      background: #60a5fa;
    }
    .acts {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 11px;
      border: 0;
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.1);
      color: var(--text);
      font: inherit;
      font-weight: 650;
      font-size: 13px;
      line-height: 1.2;
      text-decoration: none;
      white-space: nowrap;
      cursor: pointer;
    }
    .btn .dl-i {
      width: 15px;
      height: 15px;
    }
    .btn:hover {
      background: rgba(255, 255, 255, 0.16);
    }
    .btn.go {
      background: var(--accent);
      color: var(--accent-ink);
    }
    .btn.go:hover {
      background: var(--accent-2);
    }
    .btn.ghost {
      background: none;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
    }
    .btn.ghost:hover {
      background: rgba(255, 255, 255, 0.07);
    }
    .btn.small {
      padding: 5px 9px;
      font-size: 12.5px;
    }
    .btn.danger {
      color: #fca5a5;
    }
    .btn.danger-solid {
      background: #b91c1c;
      color: #fff;
    }
    .btn.danger-solid:hover {
      background: #dc2626;
    }
    .btn:disabled {
      opacity: 0.55;
      cursor: default;
    }
    .more {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border: 0;
      border-radius: 7px;
      background: none;
      color: var(--text-2);
      cursor: pointer;
    }
    .more:hover,
    .more[aria-expanded="true"] {
      background: rgba(255, 255, 255, 0.1);
      color: var(--text);
    }
    .extra {
      grid-column: 2 / -1;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 2px 0 4px;
    }
    .extra .msg {
      flex-basis: 100%;
    }
    .party.none {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
      padding: 10px 14px;
    }
    .hint {
      font-size: 12.5px;
      line-height: 1.45;
      color: var(--text-2);
    }
    .pad {
      margin: 4px 6px 4px;
    }
    .quiet {
      margin: 6px 6px 8px;
      font-size: 13.5px;
      color: var(--text-2);
    }
    .ph + .quiet,
    .panel > .quiet {
      padding: 0 8px;
    }
    details.offline summary {
      display: flex;
      align-items: center;
      gap: 7px;
      margin: 0 6px 4px;
      font-size: 12.5px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-2);
      cursor: pointer;
      list-style: none;
    }
    details.offline summary::-webkit-details-marker {
      display: none;
    }
    details.offline summary::before {
      content: "▸";
      font-size: 11px;
    }
    details.offline[open] summary::before {
      content: "▾";
    }
    .add {
      padding: 10px 14px 8px;
      border-top: 1px solid var(--line);
    }
    .add label {
      display: block;
      margin-bottom: 6px;
      font-size: 12.5px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-2);
    }
    .add-row {
      display: flex;
      gap: 6px;
    }
    .add input {
      flex: 1;
      min-width: 0;
      font: inherit;
      font-size: 15px;
      padding: 7px 10px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      background: #17171a;
      color: var(--text);
    }
    .add .btn {
      padding: 7px 12px;
    }
    .msg {
      margin: 6px 0 0;
      font-size: 13px;
      font-weight: 600;
    }
    .msg.ok {
      color: #86efac;
    }
    .msg.bad {
      color: #fca5a5;
    }
    .note {
      padding: 4px 6px;
    }
    .notes-narrow {
      display: none;
    }
    .notice {
      display: grid;
      grid-template-columns: 30px minmax(0, 1fr);
      gap: 10px;
      padding: 8px;
      border-radius: 8px;
    }
    .bell-panel .notice:hover {
      background: var(--panel-2);
    }
    .notice p {
      margin: 0 0 7px;
      font-size: 14px;
      line-height: 1.4;
    }
    .notice-acts {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .toasts {
      position: fixed;
      top: 70px;
      right: 16px;
      width: 350px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 80;
      pointer-events: none;
    }
    .toast {
      position: relative;
      pointer-events: auto;
      background: var(--panel);
      border: 1px solid var(--line);
      border-left: 3px solid var(--accent-2);
      border-radius: 10px;
      box-shadow: 0 14px 34px rgba(0, 0, 0, 0.55);
      padding: 4px 34px 4px 4px;
      animation: rise 0.22s ease-out;
    }
    .toast .x {
      position: absolute;
      top: 8px;
      right: 6px;
      border: 0;
      background: none;
      color: var(--text-2);
      padding: 4px;
      border-radius: 6px;
      cursor: pointer;
      display: grid;
    }
    .toast .x:hover {
      color: var(--text);
      background: var(--panel-2);
    }
    .toast .x .dl-i {
      width: 15px;
      height: 15px;
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(-6px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .toast {
        animation: none;
      }
    }

    /* Phones: the panels span the screen under the bar. */
    @media (max-width: 560px) {
      :host {
        gap: 4px;
      }
      .panel,
      .bell-panel {
        position: fixed;
        top: 58px;
        left: 8px;
        right: 8px;
        width: auto;
        max-height: calc(100dvh - 70px);
      }
      .toasts {
        top: 60px;
        left: 8px;
        right: 8px;
        width: auto;
      }
      .ibtn {
        min-width: 34px;
        height: 34px;
        padding: 0 6px;
      }
      /* The party as a flag on the People button: the bar is narrow. */
      .stack {
        display: none;
      }
      .phone-icon {
        display: block;
      }
    }
    /* DerpyFront's narrow bar has its own buttons too: the bell folds into
       People, and People into the account menu (fold). */
    @media (max-width: 480px) {
      :host([fold]) .wrap > .ibtn {
        display: none;
      }
      :host([tools]) .bellwrap {
        display: none;
      }
      :host([tools]) .notes-narrow {
        display: block;
      }
      :host([tools]) .dot-note {
        display: block;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "derp-social": DerpSocial;
  }
}
