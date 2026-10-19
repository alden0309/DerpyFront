// FRIENDS (r25): who's on Derp Land, on the front page (friends first, with
// Join and Watch), your friends on your account page (requests, adding by
// username, their latest games), and the friend button on someone's page.
// All from the page's one social client (Social.ts), which the top bar
// starts: nothing here asks the server on its own except the friends' games.

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api, DERPY_ACCOUNT_EVENT, derpyUsername } from "../derpland/Account";
import { openSignIn } from "../derpland/DerpBar";
import {
  addPersonIcon,
  crownIcon,
  eyeIcon,
  joinIcon,
  tokenColor,
} from "../derpland/Icons";
import { social, SOCIAL_EVENT } from "../derpland/Social";
import {
  placeText,
  placeTone,
  socialErrorText,
  englishSocial as t,
} from "../derpland/SocialText";
import type {
  FriendGame,
  PersonRow,
  SocialState,
} from "../derpland/SocialTypes";
import { nationName, timeAgo } from "./format";
import "./friends.css";

/** Light-DOM pieces that redraw whenever the social side hears anything. */
abstract class SocialPiece extends LitElement {
  @state() protected s: SocialState | null = social.state;
  @state() protected signedIn = derpyUsername() !== null;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(SOCIAL_EVENT, this.onSocial);
    window.addEventListener(DERPY_ACCOUNT_EVENT, this.onAccount);
  }

  disconnectedCallback(): void {
    window.removeEventListener(SOCIAL_EVENT, this.onSocial);
    window.removeEventListener(DERPY_ACCOUNT_EVENT, this.onAccount);
    super.disconnectedCallback();
  }

  private onSocial = () => {
    this.s = social.state;
    this.signedIn = derpyUsername() !== null;
  };

  private onAccount = () => {
    this.signedIn = derpyUsername() !== null;
    if (!this.signedIn) this.s = null;
  };
}

function token(name: string, cls = "dl-ftok"): TemplateResult {
  return html`<span
    class=${cls}
    style="--token:${tokenColor(name)}"
    aria-hidden="true"
    >${name.slice(0, 1).toUpperCase()}</span
  >`;
}

function where(p: PersonRow["place"]): TemplateResult {
  return html`<span class="dl-fwhere"
    ><i class="dl-fdot ${placeTone(p)}"></i
    ><span>${placeText(p, t)}</span></span
  >`;
}

function goButtons(r: PersonRow): TemplateResult | typeof nothing {
  if (r.join)
    return html`<button
      class="dl-btn small"
      @click=${() => void social.go(r.join!)}
    >
      ${joinIcon()} Join<span class="dl-sr"> ${r.username}</span>
    </button>`;
  if (r.watch)
    return html`<button
      class="dl-btn small ghost"
      @click=${() => void social.go(r.watch!)}
    >
      ${eyeIcon()} Watch<span class="dl-sr"> ${r.username}</span>
    </button>`;
  return nothing;
}

/** The front page's "On Derp Land now". */
@customElement("dl-online")
export class DerpOnline extends SocialPiece {
  render(): TemplateResult {
    const s = this.s;
    return html`<section class="dl-online" aria-labelledby="dl-online-h">
      <div class="dl-online-head">
        <h2 class="dl-h2 dl-online-h" id="dl-online-h">
          <span
            class="dl-fdot big ${s && s.online.length ? "play" : "off"}"
            aria-hidden="true"
          ></span>
          On Derp Land now
          ${s
            ? html`<span class="dl-online-n">${s.online.length + 1}</span>`
            : nothing}
        </h2>
        <p class="dl-online-note">
          Friends first. Join their lobby or watch their game from here.
        </p>
      </div>
      ${this.body()}
    </section>`;
  }

  private body(): TemplateResult {
    if (!this.signedIn)
      return html`<p class="dl-quiet dl-online-empty">
        <button class="dl-textbtn" @click=${() => openSignIn()}>Sign in</button>
        to see who's on Derp Land, add friends and start a party.
      </p>`;
    const s = this.s;
    if (!s)
      return html`<p class="dl-quiet dl-online-empty">
        ${social.failed ? t("unavailable") : "Looking around…"}
      </p>`;
    const me: PersonRow = {
      id: s.me.id,
      username: s.me.username,
      friend: false,
      place: s.me.appearOffline ? null : s.me.place,
    };
    return html`<ul class="dl-online-grid">
        <li class="dl-fcard me">
          ${token(me.username)}
          <span class="dl-fcard-text">
            <b>${me.username} <span class="dl-you">You</span></b>
            ${s.me.appearOffline
              ? html`<span class="dl-fwhere"
                  ><i class="dl-fdot off"></i
                  ><span>Appearing offline</span></span
                >`
              : where(me.place)}
          </span>
        </li>
        ${s.online.map(
          (r) =>
            html`<li class="dl-fcard ${r.friend ? "friend" : ""}">
              ${token(r.username)}
              <span class="dl-fcard-text">
                <b
                  ><a href="/player/${encodeURIComponent(r.username)}"
                    >${r.username}</a
                  >${r.friend
                    ? html`<span class="dl-ftag">Friend</span>`
                    : nothing}${r.inParty
                    ? html`<span class="dl-ftag party">Party</span>`
                    : nothing}</b
                >
                ${where(r.place)}
              </span>
              <span class="dl-fcard-acts">${goButtons(r)}</span>
            </li>`,
        )}
      </ul>
      ${s.online.length === 0
        ? html`<p class="dl-quiet dl-online-alone">
            Nobody else is here right now. Your friends show here when they come
            on.
          </p>`
        : nothing}`;
  }
}

/** Your account page's Friends: the list, requests, adding someone, their games. */
@customElement("dl-friends")
export class DerpFriends extends SocialPiece {
  @state() private games: FriendGame[] | null = null;
  @state() private msg: { ok: boolean; text: string } | null = null;
  @state() private busy = false;
  @state() private confirmRemove: number | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    void this.loadGames();
  }

  private lastFriends = "";
  protected updated(): void {
    // New friends: their games too.
    const key = (this.s?.friends ?? []).map((f) => f.id).join(",");
    if (this.s && key !== this.lastFriends) {
      const first = this.lastFriends === "";
      this.lastFriends = key;
      if (!first) void this.loadGames();
    }
  }

  private async loadGames(): Promise<void> {
    if (!derpyUsername()) return;
    try {
      this.games = (
        await api<{ games: FriendGame[] }>("/social/friends/games")
      ).games;
    } catch {
      this.games = [];
    }
  }

  private async act(path: string, body: object): Promise<void> {
    this.busy = true;
    const err = await social.act(path, body);
    this.busy = false;
    this.msg = err ? { ok: false, text: socialErrorText(err, t) } : null;
  }

  private async add(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const name = String(new FormData(form).get("username") ?? "").trim();
    if (!name) return;
    this.busy = true;
    const err = await social.act("/friends/request", { username: name });
    this.busy = false;
    if (err) {
      this.msg = { ok: false, text: socialErrorText(err, t) };
      return;
    }
    form.reset();
    const now = social.state?.friends.some(
      (f) => f.username.toLowerCase() === name.toLowerCase(),
    );
    this.msg = {
      ok: true,
      text: t(now ? "now_friends" : "request_sent", { name }),
    };
  }

  render(): TemplateResult | typeof nothing {
    if (!this.signedIn) return nothing;
    const s = this.s;
    return html`<section class="dl-friends-wrap" aria-labelledby="dl-friends-h">
      <div class="dl-panel dl-friends">
        <h2 class="dl-h2" id="dl-friends-h">
          Friends
          ${s
            ? html`<span class="dl-online-n">${s.friends.length}</span>`
            : nothing}
        </h2>
        ${s?.requests.incoming.length
          ? html`<ul class="dl-flist requests">
              ${s.requests.incoming.map(
                (r) =>
                  html`<li class="dl-frow">
                    ${token(r.username)}
                    <span class="dl-frow-text">
                      <a href="/player/${encodeURIComponent(r.username)}"
                        >${r.username}</a
                      >
                      <span class="dl-fwhere">wants to be friends</span>
                    </span>
                    <span class="dl-frow-acts">
                      <button
                        class="dl-btn small"
                        ?disabled=${this.busy}
                        @click=${() =>
                          void this.act("/friends/accept", { id: r.id })}
                      >
                        Accept
                      </button>
                      <button
                        class="dl-btn small ghost"
                        ?disabled=${this.busy}
                        @click=${() =>
                          void this.act("/friends/decline", { id: r.id })}
                      >
                        Decline
                      </button>
                    </span>
                  </li>`,
              )}
            </ul>`
          : nothing}
        ${!s
          ? html`<p class="dl-quiet">Loading…</p>`
          : s.friends.length === 0
            ? html`<p class="dl-quiet">
                No friends yet. Add someone by their username, or from the
                People list in the top bar.
              </p>`
            : html`<ul class="dl-flist">
                ${s.friends.map(
                  (f) =>
                    html`<li class="dl-frow">
                      ${token(f.username)}
                      <span class="dl-frow-text">
                        <a href="/player/${encodeURIComponent(f.username)}"
                          >${f.username}</a
                        >
                        ${where(f.place)}
                      </span>
                      <span class="dl-frow-acts">
                        ${goButtons(f)}
                        ${this.confirmRemove === f.id
                          ? html`<button
                                class="dl-btn small ghost dl-danger"
                                ?disabled=${this.busy}
                                @click=${() => {
                                  this.confirmRemove = null;
                                  void this.act("/friends/remove", {
                                    id: f.id,
                                  });
                                }}
                              >
                                Remove ${f.username}?
                              </button>
                              <button
                                class="dl-btn small ghost"
                                @click=${() => (this.confirmRemove = null)}
                              >
                                Keep
                              </button>`
                          : html`<button
                              class="dl-btn small ghost"
                              title="Remove ${f.username} from your friends"
                              @click=${() => (this.confirmRemove = f.id)}
                            >
                              Remove
                            </button>`}
                      </span>
                    </li>`,
                )}
              </ul>`}
        ${s?.requests.outgoing.length
          ? html`<p class="dl-fwaiting">
              Waiting on:
              ${s.requests.outgoing.map(
                (r, i) =>
                  html`${i ? ", " : ""}<b>${r.username}</b>
                    <button
                      class="dl-textbtn small"
                      ?disabled=${this.busy}
                      @click=${() =>
                        void this.act("/friends/cancel", { id: r.id })}
                    >
                      take back
                    </button>`,
              )}
            </p>`
          : nothing}
        <form class="dl-fadd" @submit=${(e: SubmitEvent) => this.add(e)}>
          <label for="dl-fadd-name">Add a friend</label>
          <div class="dl-fadd-row">
            <input
              id="dl-fadd-name"
              name="username"
              autocomplete="off"
              spellcheck="false"
              maxlength="20"
              placeholder="Their username"
              required
            />
            <button class="dl-btn small" ?disabled=${this.busy}>
              ${addPersonIcon()} Add
            </button>
          </div>
        </form>
        ${this.msg
          ? html`<p class="dl-fmsg ${this.msg.ok ? "ok" : "bad"}" role="status">
              ${this.msg.text}
            </p>`
          : nothing}
      </div>
      <div class="dl-panel dl-fgames">
        <h2 class="dl-h2">Your friends lately</h2>
        ${this.renderGames()}
      </div>
    </section>`;
  }

  private renderGames(): TemplateResult {
    const g = this.games;
    if (g === null) return html`<p class="dl-quiet">Loading…</p>`;
    if (g.length === 0)
      return html`<p class="dl-quiet">
        Games your friends finish show up here.
      </p>`;
    const now = Date.now();
    return html`<ol class="dl-feed-list">
      ${g.map(
        (r) =>
          html`<li class="${r.game} ${r.won ? "won" : ""}">
            <span class="dl-feed-text">
              <a href="/player/${encodeURIComponent(r.username)}"
                >${r.username}</a
              >
              ${r.won ? "won" : "played"}
              ${r.game === "derpyfront"
                ? html`DerpyFront on <b>${r.where}</b>`
                : html`<a
                      class="dl-feed-game"
                      href="/chronicle/${encodeURIComponent(r.gameId)}"
                      >Derpy Conquest</a
                    >
                    as <b>${nationName(r.where)}</b>`}
              ${r.won ? crownIcon("dl-i dl-crown") : nothing}
            </span>
            <span class="dl-feed-when">${timeAgo(r.endedAt, now)}</span>
          </li>`,
      )}
    </ol>`;
  }
}

/** On someone's page: where they are now, and being friends with them. */
@customElement("dl-friend-status")
export class DerpFriendStatus extends SocialPiece {
  @property({ type: String }) username = "";
  @state() private msg: string | null = null;
  @state() private busy = false;
  @state() private sent = false;

  private async act(path: string, body: object): Promise<void> {
    this.busy = true;
    const err = await social.act(path, body);
    this.busy = false;
    this.msg = err ? socialErrorText(err, t) : null;
    if (!err && path === "/friends/request") this.sent = true;
  }

  render(): TemplateResult | typeof nothing {
    const s = this.s;
    if (!this.signedIn || !s || !this.username) return nothing;
    const key = this.username.toLowerCase();
    if (key === s.me.username.toLowerCase()) return nothing;
    const friend = s.friends.find((f) => f.username.toLowerCase() === key);
    const online = s.online.find((r) => r.username.toLowerCase() === key);
    const row = online ?? friend;
    const incoming = s.requests.incoming.find(
      (r) => r.username.toLowerCase() === key,
    );
    const outgoing =
      this.sent ||
      s.requests.outgoing.some((r) => r.username.toLowerCase() === key);
    return html`<div class="dl-fstatus">
      ${row
        ? html`<span class="dl-fstatus-where">${where(row.place)}</span>
            ${goButtons(row)}`
        : nothing}
      ${friend
        ? html`<span class="dl-ftag friend">Friends</span>`
        : incoming
          ? html`<button
              class="dl-btn small"
              ?disabled=${this.busy}
              @click=${() =>
                void this.act("/friends/accept", { id: incoming.id })}
            >
              ${addPersonIcon()} Accept friend request
            </button>`
          : outgoing
            ? html`<span class="dl-ftag">Friend request sent</span>`
            : html`<button
                class="dl-btn small ghost"
                ?disabled=${this.busy}
                @click=${() =>
                  void this.act("/friends/request", {
                    username: this.username,
                  })}
              >
                ${addPersonIcon()} Add friend
              </button>`}
      ${this.msg ? html`<span class="dl-fmsg bad">${this.msg}</span>` : nothing}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dl-online": DerpOnline;
    "dl-friends": DerpFriends;
    "dl-friend-status": DerpFriendStatus;
  }
}
