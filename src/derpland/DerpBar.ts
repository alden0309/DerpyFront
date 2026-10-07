// The bar across the top of every Derp Land page: the hub, the Store,
// Inventory, Leaderboard and account pages, and both games' home screens.
// Play opens a menu of the games; the right side shows your Derp Coins and
// your player token, or a Sign in button that opens the sign-in dialog.
//
// It renders in a shadow root so DerpyFront's and Conquest's own CSS can't
// restyle it. Pages ask it to open the sign-in dialog with openSignIn().

import { css, html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import {
  AUTH_ERROR_TEXT,
  AuthError,
  createAccount,
  DERPY_ACCOUNT_EVENT,
  derpyUsername,
  formatCoins,
  me,
  signIn,
  signOut,
} from "./Account";
import {
  caretIcon,
  chestIcon,
  closeIcon,
  coinIcon,
  pawnIcon,
  podiumIcon,
  signOutIcon,
  stallIcon,
  tokenColor,
} from "./Icons";

export type BarPage =
  | "home"
  | "derpyfront"
  | "conquest"
  | "store"
  | "inventory"
  | "leaderboard"
  | "account";

const OPEN_SIGN_IN = "derp-open-sign-in";

/** Every word the bar shows, so DerpyFront can pass translated ones. */
export interface BarLabels {
  play: string;
  store: string;
  inventory: string;
  leaderboard: string;
  signIn: string;
  newAccount: string;
  makeAccount: string;
  makeMyAccount: string;
  signOut: string;
  yourAccount: string;
  yourStats: string;
  yourSkins: string;
  yourCoins: string;
  derpCoins: string;
  frontBlurb: string;
  conquestBlurb: string;
  dialogBlurb: string;
  username: string;
  password: string;
  rules: string;
  close: string;
  errors: Record<AuthError, string>;
}

export const BAR_LABELS: BarLabels = {
  play: "Play",
  store: "Store",
  inventory: "Inventory",
  leaderboard: "Leaderboard",
  signIn: "Sign in",
  newAccount: "New account",
  makeAccount: "Make an account",
  makeMyAccount: "Make my account",
  signOut: "Sign out",
  yourAccount: "Your account",
  yourStats: "Your stats and replays",
  yourSkins: "Your skins",
  yourCoins: "Your Derp Coins",
  derpCoins: "Derp Coins",
  frontBlurb: "Paint the map your color in real time, then betray your allies.",
  conquestBlurb:
    "Govern a colony in the 1600s Americas for a crown that wants paying.",
  dialogBlurb:
    "One account for DerpyFront and Derpy Conquest. Your Derp Coins and skins come with you.",
  username: "Username",
  password: "Password",
  rules:
    "3 to 20 letters, numbers or underscores. Passwords need 6 characters or more.",
  close: "Close",
  errors: AUTH_ERROR_TEXT,
};

/** Open the sign-in dialog in this page's bar. */
export function openSignIn(mode: "signin" | "create" = "signin"): void {
  window.dispatchEvent(new CustomEvent(OPEN_SIGN_IN, { detail: mode }));
}

export const GAMES = [
  {
    id: "derpyfront",
    name: "DerpyFront",
    href: "/derpyfront",
    art: "/derpland/derpyfront-box.webp",
    blurb: "frontBlurb",
  },
  {
    id: "conquest",
    name: "Derpy Conquest",
    href: "/conquest",
    art: "/derpland/conquest-box.webp",
    blurb: "conquestBlurb",
  },
] as const;

/** The Derp Land mark: a grinning hill with a flag planted on top. */
function mark(): TemplateResult {
  return html`<svg class="mark" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M2 34c4-8 10-12 18-12s14 4 18 12z" fill="#ffc531" />
    <path
      d="M2 34c4-8 10-12 18-12s14 4 18 12"
      fill="none"
      stroke="#b97c00"
      stroke-width="2"
    />
    <rect x="19" y="4" width="2.6" height="19" rx="1.3" fill="#fbf3e2" />
    <path
      d="M21.6 5c4 1.6 7 .2 11 1.6l-2.4 4.4 2.4 4.2c-4-1.3-7 .1-11-1.5z"
      fill="#ef5a3c"
    />
    <circle cx="14" cy="29" r="1.7" fill="#231a2e" />
    <circle cx="25" cy="28.4" r="1.7" fill="#231a2e" />
    <path
      d="M16.5 31.5q3.5 2.6 7 0"
      fill="none"
      stroke="#231a2e"
      stroke-width="1.8"
      stroke-linecap="round"
    />
  </svg>`;
}

@customElement("derp-bar")
export class DerpBar extends LitElement {
  /** Which page this is, for the highlighted tab. */
  @property({ type: String }) page: BarPage = "home";
  /** Replacement words (DerpyFront passes translated ones). */
  @property({ attribute: false }) labels: Partial<BarLabels> = {};

  private get t(): BarLabels {
    return { ...BAR_LABELS, ...this.labels };
  }

  @state() private username: string | null = derpyUsername();
  @state() private coins: number | null = null;
  @state() private menu: "play" | "account" | null = null;
  @state() private authMode: "signin" | "create" = "signin";
  @state() private authError: string | null = null;
  @state() private authBusy = false;

  @query("dialog") private dialog!: HTMLDialogElement;

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(DERPY_ACCOUNT_EVENT, this.onAccount);
    window.addEventListener(OPEN_SIGN_IN, this.onOpenSignIn);
    document.addEventListener("pointerdown", this.onOutside);
    document.addEventListener("keydown", this.onKey);
    document.addEventListener("visibilitychange", this.onVisible);
    void this.refresh();
  }

  disconnectedCallback(): void {
    window.removeEventListener(DERPY_ACCOUNT_EVENT, this.onAccount);
    window.removeEventListener(OPEN_SIGN_IN, this.onOpenSignIn);
    document.removeEventListener("pointerdown", this.onOutside);
    document.removeEventListener("keydown", this.onKey);
    document.removeEventListener("visibilitychange", this.onVisible);
    super.disconnectedCallback();
  }

  private onAccount = () => void this.refresh();
  private onVisible = () => {
    if (document.visibilityState === "visible") void this.refresh();
  };
  private onOpenSignIn = (e: Event) => {
    const mode = (e as CustomEvent).detail;
    this.showSignIn(mode === "create" ? "create" : "signin");
  };
  private onOutside = (e: PointerEvent) => {
    if (this.menu === null) return;
    const path = e.composedPath();
    const inside = path.some(
      (n) => n instanceof HTMLElement && n.dataset.menu === this.menu,
    );
    if (!inside) this.menu = null;
  };
  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.menu !== null) this.menu = null;
  };

  private async refresh(): Promise<void> {
    this.username = derpyUsername();
    const m = await me();
    this.username = m?.username ?? derpyUsername();
    this.coins = m?.coins ?? null;
  }

  private showSignIn(mode: "signin" | "create"): void {
    this.menu = null;
    this.authMode = mode;
    this.authError = null;
    void this.updateComplete.then(() => {
      if (!this.dialog.open) this.dialog.showModal();
    });
  }

  private async submit(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = new FormData(form);
    const username = String(data.get("username") ?? "");
    const password = String(data.get("password") ?? "");
    this.authBusy = true;
    this.authError = null;
    const err: AuthError | null =
      this.authMode === "create"
        ? await createAccount(username, password)
        : await signIn(username, password);
    this.authBusy = false;
    if (err) {
      this.authError = this.t.errors[err];
      return;
    }
    form.reset();
    this.dialog.close();
  }

  private toggle(menu: "play" | "account"): void {
    this.menu = this.menu === menu ? null : menu;
  }

  render(): TemplateResult {
    const p = this.page;
    const t = this.t;
    const playing = p === "home" || p === "derpyfront" || p === "conquest";
    const tab = (
      id: BarPage,
      href: string,
      label: string,
      icon: TemplateResult,
    ) =>
      html`<a
        class="tab ${p === id ? "on" : ""}"
        href=${href}
        aria-current=${p === id ? "page" : "false"}
        >${icon}<span>${label}</span></a
      >`;
    return html`
      <header class="bar">
        <div class="inner">
          <a class="brand" href="/" aria-label="Derp Land home"
            >${mark()}<span>Derp Land</span></a
          >
          <nav class="tabs" aria-label="Derp Land">
            <div class="play" data-menu="play">
              <button
                class="tab ${playing ? "on" : ""}"
                aria-haspopup="true"
                aria-expanded=${this.menu === "play"}
                @click=${() => this.toggle("play")}
              >
                ${pawnIcon()}<span>${t.play}</span>${caretIcon()}
              </button>
              ${this.menu === "play" ? this.renderPlayMenu() : nothing}
            </div>
            ${tab("store", "/store", t.store, stallIcon())}
            ${tab("inventory", "/inventory", t.inventory, chestIcon())}
            ${tab("leaderboard", "/leaderboard", t.leaderboard, podiumIcon())}
          </nav>
          <div class="right">
            <slot name="tools"></slot>
            ${this.username ? this.renderSignedIn() : this.renderSignedOut()}
          </div>
        </div>
      </header>
      ${this.renderDialog()}
    `;
  }

  private renderPlayMenu(): TemplateResult {
    return html`<div class="panel play-panel" role="menu">
      ${GAMES.map(
        (g) =>
          html`<a
            class="game ${g.id === this.page ? "here" : ""}"
            role="menuitem"
            href=${g.href}
          >
            <img src=${g.art} alt="" width="120" height="75" />
            <span class="game-text">
              <span class="game-name ${g.id}">${g.name}</span>
              <span class="game-blurb">${this.t[g.blurb]}</span>
            </span>
          </a>`,
      )}
    </div>`;
  }

  private renderSignedOut(): TemplateResult {
    return html`<button
      class="signin"
      @click=${() => this.showSignIn("signin")}
    >
      ${this.t.signIn}
    </button>`;
  }

  private renderSignedIn(): TemplateResult {
    const name = this.username!;
    const t = this.t;
    const token = (cls: string) =>
      html`<span class=${cls} style="--token:${tokenColor(name)}"
        >${name.slice(0, 1).toUpperCase()}</span
      >`;
    return html`
      ${this.coins !== null
        ? html`<a class="coins" href="/store" title=${t.yourCoins}
            >${coinIcon()}<span>${formatCoins(this.coins)}</span></a
          >`
        : nothing}
      <div class="acct" data-menu="account">
        <button
          class="token-btn ${this.page === "account" ? "on" : ""}"
          aria-haspopup="true"
          aria-expanded=${this.menu === "account"}
          aria-label=${t.yourAccount}
          @click=${() => this.toggle("account")}
        >
          ${token("token")}
        </button>
        ${this.menu === "account"
          ? html`<div class="panel acct-panel" role="menu">
              <div class="who">
                ${token("token big")}
                <span class="who-text">
                  <b>${name}</b>
                  ${this.coins !== null
                    ? html`<span class="who-coins"
                        >${coinIcon("dl-coin sm")} ${formatCoins(this.coins)}
                        ${t.derpCoins}</span
                      >`
                    : nothing}
                </span>
              </div>
              <a class="item" role="menuitem" href="/account"
                >${podiumIcon()} ${t.yourStats}</a
              >
              <a class="item" role="menuitem" href="/inventory"
                >${chestIcon()} ${t.yourSkins}</a
              >
              <button
                class="item"
                role="menuitem"
                @click=${() => {
                  this.menu = null;
                  void signOut();
                }}
              >
                ${signOutIcon()} ${t.signOut}
              </button>
            </div>`
          : nothing}
      </div>
    `;
  }

  private renderDialog(): TemplateResult {
    const t = this.t;
    const create = this.authMode === "create";
    const mode = (m: "signin" | "create", label: string) =>
      html`<button
        type="button"
        aria-pressed=${this.authMode === m}
        @click=${() => {
          this.authMode = m;
          this.authError = null;
        }}
      >
        ${label}
      </button>`;
    return html`<dialog aria-labelledby="dlg-title">
      <div class="dlg-head">
        <h2 id="dlg-title">${create ? t.makeAccount : t.signIn}</h2>
        <button
          class="x"
          aria-label=${t.close}
          @click=${() => this.dialog.close()}
        >
          ${closeIcon()}
        </button>
      </div>
      <p class="dlg-sub">${t.dialogBlurb}</p>
      <div class="seg">
        ${mode("signin", t.signIn)} ${mode("create", t.newAccount)}
      </div>
      <form @submit=${(e: SubmitEvent) => this.submit(e)}>
        <label>
          <span>${t.username}</span>
          <input
            name="username"
            autocomplete="username"
            required
            minlength="3"
            maxlength="20"
            pattern="[A-Za-z0-9_]+"
          />
        </label>
        <label>
          <span>${t.password}</span>
          <input
            name="password"
            type="password"
            autocomplete=${create ? "new-password" : "current-password"}
            required
            minlength="6"
          />
        </label>
        ${create ? html`<p class="hint">${t.rules}</p>` : nothing}
        ${this.authError
          ? html`<p class="err" role="alert">${this.authError}</p>`
          : nothing}
        <button class="primary" ?disabled=${this.authBusy}>
          ${create ? t.makeMyAccount : t.signIn}
        </button>
      </form>
    </dialog>`;
  }

  static styles = css`
    :host {
      --ink: #231a2e;
      --ink-deep: #140e1b;
      --card: #fbf3e2;
      --card-2: #f0e1bf;
      --gold: #ffc531;
      --gold-deep: #b97c00;
      display: block;
      position: relative;
      z-index: 60;
      font-family: "Archivo Variable", "Archivo", system-ui, sans-serif;
      color: var(--card);
      -webkit-font-smoothing: antialiased;
    }
    * {
      box-sizing: border-box;
    }
    a {
      color: inherit;
    }
    .bar {
      background: var(--ink);
      border-bottom: 3px solid var(--ink-deep);
    }
    .inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 16px;
      height: 64px;
      display: flex;
      align-items: center;
      gap: 18px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      font-family: "Bagel Fat One", system-ui, sans-serif;
      font-size: 25px;
      line-height: 1;
      color: var(--gold);
      text-shadow: 0 2px 0 var(--gold-deep);
      white-space: nowrap;
      margin-right: 6px;
    }
    .mark {
      width: 36px;
      height: 36px;
      margin-top: -4px;
    }
    .brand:focus-visible,
    .tab:focus-visible,
    .coins:focus-visible,
    .token-btn:focus-visible,
    .signin:focus-visible,
    .game:focus-visible,
    .item:focus-visible {
      outline: 3px solid var(--gold);
      outline-offset: 2px;
      border-radius: 10px;
    }
    .tabs {
      display: flex;
      align-items: stretch;
      align-self: stretch;
      gap: 2px;
    }
    .play {
      position: relative;
      display: flex;
    }
    .tab {
      position: relative;
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 0 12px;
      color: rgba(251, 243, 226, 0.78);
      font: inherit;
      font-weight: 720;
      font-stretch: 94%;
      font-size: 15.5px;
      text-decoration: none;
      background: none;
      border: 0;
      cursor: pointer;
      white-space: nowrap;
    }
    .tab:hover {
      color: var(--card);
    }
    .tab.on {
      color: var(--gold);
    }
    .tab.on::after {
      content: "";
      position: absolute;
      left: 10px;
      right: 10px;
      bottom: -3px;
      height: 5px;
      border-radius: 5px 5px 0 0;
      background: var(--gold);
    }
    .dl-i {
      width: 20px;
      height: 20px;
      flex: none;
    }
    .dl-i-sm {
      width: 14px;
      height: 14px;
      margin-left: -2px;
      opacity: 0.8;
    }
    .tab[aria-expanded="true"] .dl-i-sm {
      transform: rotate(180deg);
    }
    .right {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .coins {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px 4px 5px;
      border-radius: 999px;
      background: rgba(251, 243, 226, 0.08);
      font-weight: 800;
      font-size: 15px;
      font-variant-numeric: tabular-nums;
      text-decoration: none;
    }
    .coins:hover {
      background: rgba(251, 243, 226, 0.14);
    }
    .dl-coin {
      width: 24px;
      height: 24px;
      flex: none;
    }
    .dl-coin.sm {
      width: 17px;
      height: 17px;
    }
    .acct {
      position: relative;
    }
    .token-btn {
      padding: 0;
      border: 0;
      background: none;
      cursor: pointer;
      border-radius: 50%;
      display: block;
    }
    .token {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-family: "Bagel Fat One", system-ui, sans-serif;
      font-size: 19px;
      line-height: 1;
      padding-top: 2px;
      color: #fff;
      background: var(--token);
      border: 2.5px solid var(--card);
      box-shadow:
        inset 0 -4px 0 rgba(0, 0, 0, 0.22),
        0 3px 0 var(--ink-deep);
      text-shadow: 0 1px 0 rgba(0, 0, 0, 0.35);
    }
    .token-btn.on .token,
    .token-btn[aria-expanded="true"] .token {
      border-color: var(--gold);
    }
    .token.big {
      width: 46px;
      height: 46px;
      font-size: 23px;
      border-color: var(--ink);
      box-shadow:
        inset 0 -4px 0 rgba(0, 0, 0, 0.22),
        0 3px 0 var(--ink);
    }
    .signin,
    .primary {
      font: inherit;
      font-weight: 800;
      font-size: 15px;
      background: var(--gold);
      color: var(--ink);
      border: 2px solid var(--ink-deep);
      border-radius: 10px;
      padding: 7px 14px;
      box-shadow: 0 3px 0 var(--ink-deep);
      cursor: pointer;
    }
    .signin:active,
    .primary:active {
      transform: translateY(2px);
      box-shadow: 0 1px 0 var(--ink-deep);
    }
    .panel {
      position: absolute;
      top: calc(100% + 10px);
      background: var(--card);
      color: var(--ink);
      border: 2px solid var(--ink-deep);
      border-radius: 14px;
      box-shadow: 6px 6px 0 rgba(10, 6, 14, 0.5);
      padding: 8px;
    }
    .play-panel {
      left: -8px;
      width: 380px;
    }
    .game {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 12px;
      align-items: center;
      padding: 8px;
      border-radius: 10px;
      text-decoration: none;
    }
    .game:hover,
    .game.here {
      background: var(--card-2);
    }
    .game img {
      width: 120px;
      height: 75px;
      object-fit: cover;
      border-radius: 6px;
      border: 2px solid var(--ink);
      display: block;
      background: var(--card-2);
    }
    .game-text {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .game-name {
      line-height: 1.05;
    }
    .game-name.derpyfront {
      font-family: "Bagel Fat One", system-ui, sans-serif;
      font-size: 21px;
      color: #d4432a;
    }
    .game-name.conquest {
      font-family: "IM Fell English SC", Georgia, serif;
      font-size: 24px;
      color: #7e231c;
    }
    .game-blurb {
      font-size: 13.5px;
      line-height: 1.35;
      color: #554a5e;
    }
    .acct-panel {
      right: -4px;
      width: 260px;
    }
    .who {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 8px 12px;
      border-bottom: 2px dashed rgba(35, 26, 46, 0.2);
      margin-bottom: 6px;
    }
    .who-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .who-text b {
      font-size: 17px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .who-coins {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 13.5px;
      color: #554a5e;
      font-variant-numeric: tabular-nums;
    }
    .item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 9px 10px;
      border-radius: 9px;
      border: 0;
      background: none;
      font: inherit;
      font-weight: 650;
      font-size: 15px;
      color: var(--ink);
      text-decoration: none;
      cursor: pointer;
      text-align: left;
    }
    .item:hover {
      background: var(--card-2);
    }

    dialog {
      border: 2px solid var(--ink-deep);
      border-radius: 16px;
      padding: 0;
      background: var(--card);
      color: var(--ink);
      width: min(420px, calc(100vw - 32px));
      box-shadow: 8px 8px 0 rgba(10, 6, 14, 0.55);
    }
    dialog::backdrop {
      background: rgba(20, 14, 27, 0.62);
    }
    .dlg-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: 20px 20px 0;
    }
    h2 {
      margin: 0;
      font-family: "Bagel Fat One", system-ui, sans-serif;
      font-weight: 400;
      font-size: 30px;
      line-height: 1.05;
    }
    .x {
      border: 0;
      background: none;
      color: var(--ink);
      cursor: pointer;
      padding: 4px;
      margin: -4px -6px 0 0;
      border-radius: 8px;
    }
    .x:hover {
      background: var(--card-2);
    }
    .dlg-sub {
      margin: 8px 20px 0;
      font-size: 15px;
      line-height: 1.45;
      color: #4a3f52;
    }
    .seg {
      display: flex;
      gap: 4px;
      margin: 16px 20px 0;
      padding: 4px;
      border-radius: 12px;
      background: var(--card-2);
    }
    .seg button {
      flex: 1;
      font: inherit;
      font-weight: 750;
      font-size: 14.5px;
      padding: 8px;
      border: 0;
      border-radius: 9px;
      background: none;
      color: var(--ink);
      cursor: pointer;
    }
    .seg button[aria-pressed="true"] {
      background: var(--ink);
      color: var(--card);
    }
    form {
      display: grid;
      gap: 12px;
      padding: 16px 20px 22px;
    }
    label span {
      display: block;
      font-weight: 750;
      font-size: 14px;
      margin-bottom: 5px;
    }
    input {
      width: 100%;
      font: inherit;
      font-size: 16px;
      padding: 10px 12px;
      border: 2px solid var(--ink);
      border-radius: 10px;
      background: #fffdf7;
      color: var(--ink);
    }
    input:focus-visible {
      outline: 3px solid var(--gold);
      outline-offset: 1px;
    }
    .hint {
      margin: 0;
      font-size: 13.5px;
      line-height: 1.4;
      color: #5d5266;
    }
    .err {
      margin: 0;
      font-weight: 700;
      font-size: 14.5px;
      color: #b3261e;
    }
    .primary {
      font-size: 16px;
      padding: 11px;
      border-radius: 12px;
      box-shadow: 0 4px 0 var(--ink-deep);
      margin-top: 4px;
    }
    .primary:disabled {
      opacity: 0.55;
      cursor: progress;
    }

    @media (max-width: 860px) {
      .tab span {
        display: none;
      }
      .tab {
        padding: 0 10px;
      }
      .tab .dl-i {
        width: 22px;
        height: 22px;
      }
    }
    @media (max-width: 480px) {
      :host([has-tools]) .brand span {
        display: none;
      }
    }
    @media (max-width: 560px) {
      .inner {
        position: relative;
        flex-wrap: wrap;
        height: auto;
        padding: 0 12px;
        gap: 0 10px;
      }
      .brand {
        height: 56px;
        font-size: 22px;
      }
      .right {
        height: 56px;
      }
      .tabs {
        order: 3;
        width: 100%;
        height: 48px;
        justify-content: space-between;
        border-top: 1px solid rgba(251, 243, 226, 0.1);
      }
      .tab span {
        display: inline;
        font-size: 13.5px;
      }
      .tab {
        gap: 5px;
        padding: 0 6px;
      }
      .tab .dl-i {
        width: 18px;
        height: 18px;
      }
      .play {
        position: static;
      }
      .play-panel {
        left: 10px;
        right: 10px;
        top: calc(100% + 6px);
        width: auto;
      }
      .coins {
        font-size: 14px;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      * {
        transition: none !important;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "derp-bar": DerpBar;
  }
}
