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

/** The Derp Land mark: a hill with a flag planted on top. */
function mark(): TemplateResult {
  return html`<svg class="mark" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M3 34c4-8 9.5-12 17-12s13 4 17 12z" fill="#e7b84a" />
    <rect x="19" y="5" width="2.2" height="18" rx="1.1" fill="#e4e4e7" />
    <path
      d="M21.2 6c4 1.6 7 .2 10.6 1.6l-2.2 4.2 2.2 4c-3.8-1.3-6.8.1-10.6-1.5z"
      fill="#d9573f"
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
          <a
            class="brand ${p === "derpyfront" ? "compact" : ""}"
            href="/"
            aria-label="Derp Land home"
            >${mark()}<span>Derp Land</span></a
          >
          <slot name="brand"></slot>
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
      --bar: #18181b;
      --panel: #202024;
      --panel-2: #2a2a30;
      --line: rgba(255, 255, 255, 0.09);
      --text: #f4f4f5;
      --text-2: #a1a1aa;
      --blue: #0084d1;
      --blue-2: #1a9be6;
      --gold: #e7b84a;
      display: block;
      position: relative;
      z-index: 60;
      font-family: "Archivo Variable", "Archivo", system-ui, sans-serif;
      color: var(--text);
      -webkit-font-smoothing: antialiased;
    }
    * {
      box-sizing: border-box;
    }
    a {
      color: inherit;
    }
    .bar {
      background: rgba(24, 24, 27, 0.94);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--line);
    }
    .inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 16px;
      height: 60px;
      display: flex;
      align-items: center;
      gap: 18px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      font-weight: 760;
      font-stretch: 108%;
      font-size: 18px;
      letter-spacing: -0.01em;
      line-height: 1;
      color: var(--text);
      white-space: nowrap;
      margin-right: 4px;
    }
    .brand.compact span {
      display: none;
    }
    ::slotted([slot="brand"]) {
      padding-left: 14px;
      margin-left: -6px;
      border-left: 1px solid var(--line);
    }
    .mark {
      width: 30px;
      height: 30px;
      margin-top: -3px;
    }
    .brand:focus-visible,
    .tab:focus-visible,
    .coins:focus-visible,
    .token-btn:focus-visible,
    .signin:focus-visible,
    .game:focus-visible,
    .item:focus-visible {
      outline: 2px solid var(--blue-2);
      outline-offset: 2px;
      border-radius: 6px;
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
      color: rgba(244, 244, 245, 0.7);
      font: inherit;
      font-weight: 600;
      font-size: 15px;
      text-decoration: none;
      background: none;
      border: 0;
      cursor: pointer;
      white-space: nowrap;
      transition: color 0.15s;
    }
    .tab:hover {
      color: var(--text);
    }
    .tab.on {
      color: var(--text);
    }
    .tab.on::after {
      content: "";
      position: absolute;
      left: 12px;
      right: 12px;
      bottom: -1px;
      height: 2px;
      background: var(--blue-2);
    }
    .dl-i {
      width: 18px;
      height: 18px;
      flex: none;
      opacity: 0.85;
    }
    .dl-i-sm {
      width: 13px;
      height: 13px;
      margin-left: -2px;
      opacity: 0.7;
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
      padding: 5px 11px 5px 7px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.06);
      font-weight: 650;
      font-size: 14.5px;
      font-variant-numeric: tabular-nums;
      text-decoration: none;
    }
    .coins:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    .dl-coin {
      width: 20px;
      height: 20px;
      flex: none;
    }
    .dl-coin.sm {
      width: 16px;
      height: 16px;
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
      width: 34px;
      height: 34px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-weight: 700;
      font-size: 15px;
      line-height: 1;
      color: #fff;
      background: var(--token);
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.14);
    }
    .token-btn.on .token,
    .token-btn[aria-expanded="true"] .token {
      box-shadow: 0 0 0 2px var(--blue-2);
    }
    .token.big {
      width: 42px;
      height: 42px;
      font-size: 18px;
    }
    .signin,
    .primary {
      font: inherit;
      font-weight: 650;
      font-size: 14.5px;
      background: var(--blue);
      color: #fff;
      border: 0;
      border-radius: 8px;
      padding: 8px 14px;
      cursor: pointer;
      transition: background-color 0.15s;
    }
    .signin:hover,
    .primary:hover {
      background: var(--blue-2);
    }
    .panel {
      position: absolute;
      top: calc(100% + 10px);
      background: var(--panel);
      color: var(--text);
      border: 1px solid var(--line);
      border-radius: 10px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
      padding: 6px;
    }
    .play-panel {
      left: -8px;
      width: 380px;
    }
    .game {
      display: grid;
      grid-template-columns: 112px 1fr;
      gap: 12px;
      align-items: center;
      padding: 8px;
      border-radius: 8px;
      text-decoration: none;
    }
    .game:hover,
    .game.here {
      background: var(--panel-2);
    }
    .game img {
      width: 112px;
      height: 70px;
      object-fit: cover;
      border-radius: 6px;
      display: block;
      background: var(--panel-2);
    }
    .game-text {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .game-name {
      line-height: 1.1;
    }
    .game-name.derpyfront {
      font-weight: 780;
      font-stretch: 108%;
      font-size: 17px;
      color: var(--text);
    }
    .game-name.conquest {
      font-family: "IM Fell English SC", Georgia, serif;
      font-size: 20px;
      color: #ead8ae;
    }
    .game-blurb {
      font-size: 13px;
      line-height: 1.4;
      color: var(--text-2);
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
      border-bottom: 1px solid var(--line);
      margin-bottom: 6px;
    }
    .who-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .who-text b {
      font-size: 16px;
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .who-coins {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 13px;
      color: var(--text-2);
      font-variant-numeric: tabular-nums;
    }
    .item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 9px 10px;
      border-radius: 7px;
      border: 0;
      background: none;
      font: inherit;
      font-weight: 550;
      font-size: 14.5px;
      color: var(--text);
      text-decoration: none;
      cursor: pointer;
      text-align: left;
    }
    .item:hover {
      background: var(--panel-2);
    }

    dialog {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 0;
      background: var(--panel);
      color: var(--text);
      width: min(420px, calc(100vw - 32px));
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
    }
    dialog::backdrop {
      background: rgba(9, 9, 11, 0.7);
      backdrop-filter: blur(2px);
    }
    .dlg-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: 20px 20px 0;
    }
    h2 {
      margin: 0;
      font-weight: 750;
      font-size: 22px;
      line-height: 1.2;
    }
    .x {
      border: 0;
      background: none;
      color: var(--text-2);
      cursor: pointer;
      padding: 4px;
      margin: -4px -6px 0 0;
      border-radius: 6px;
    }
    .x:hover {
      background: var(--panel-2);
      color: var(--text);
    }
    .dlg-sub {
      margin: 6px 20px 0;
      font-size: 14.5px;
      line-height: 1.5;
      color: var(--text-2);
    }
    .seg {
      display: flex;
      gap: 4px;
      margin: 16px 20px 0;
      padding: 3px;
      border-radius: 9px;
      background: rgba(255, 255, 255, 0.05);
    }
    .seg button {
      flex: 1;
      font: inherit;
      font-weight: 600;
      font-size: 14px;
      padding: 7px;
      border: 0;
      border-radius: 7px;
      background: none;
      color: var(--text-2);
      cursor: pointer;
    }
    .seg button[aria-pressed="true"] {
      background: var(--panel-2);
      color: var(--text);
    }
    form {
      display: grid;
      gap: 12px;
      padding: 16px 20px 22px;
    }
    label span {
      display: block;
      font-weight: 600;
      font-size: 13.5px;
      margin-bottom: 5px;
      color: var(--text-2);
    }
    input {
      width: 100%;
      font: inherit;
      font-size: 16px;
      padding: 9px 11px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      background: #17171a;
      color: var(--text);
    }
    input:focus-visible {
      outline: 2px solid var(--blue-2);
      outline-offset: 0;
      border-color: transparent;
    }
    .hint {
      margin: 0;
      font-size: 13px;
      line-height: 1.45;
      color: var(--text-2);
    }
    .err {
      margin: 0;
      font-weight: 600;
      font-size: 14px;
      color: #f87171;
    }
    .primary {
      font-size: 15px;
      padding: 11px;
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
        width: 20px;
        height: 20px;
      }
    }
    @media (max-width: 480px) {
      :host([has-tools]) .brand span,
      :host([has-tools]) .coins {
        display: none;
      }
      :host([has-tools]) .right {
        gap: 4px;
      }
      :host([has-tools]) .inner {
        gap: 0 8px;
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
        height: 54px;
        font-size: 17px;
      }
      ::slotted([slot="brand"]) {
        height: 54px;
      }
      .right {
        height: 54px;
      }
      .tabs {
        order: 3;
        width: 100%;
        height: 46px;
        justify-content: space-between;
        border-top: 1px solid var(--line);
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
        width: 17px;
        height: 17px;
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
