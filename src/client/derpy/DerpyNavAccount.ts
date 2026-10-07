import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { translateText } from "../Utils";
import { DERPY_ACCOUNT_EVENT, derpyMe, derpyUsername } from "./DerpyAccount";
import { coinAmount } from "./DerpyUi";

/**
 * The account button in the nav: "Sign in" when signed out, otherwise your
 * name and Derp Coins. Opens the account page either way.
 */
@customElement("derpy-nav-account")
export class DerpyNavAccount extends LitElement {
  @property({ type: String }) variant: "desktop" | "mobile" = "desktop";

  @state() private username: string | null = derpyUsername();
  @state() private coins: number | null = null;

  createRenderRoot() {
    return this;
  }

  private onChanged = () => void this.refresh();

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(DERPY_ACCOUNT_EVENT, this.onChanged);
    void this.refresh();
  }

  disconnectedCallback(): void {
    window.removeEventListener(DERPY_ACCOUNT_EVENT, this.onChanged);
    super.disconnectedCallback();
  }

  private async refresh(): Promise<void> {
    this.username = derpyUsername();
    const me = await derpyMe();
    this.coins = me?.coins ?? null;
    this.username = me?.username ?? derpyUsername();
  }

  render() {
    const signedIn = this.username !== null;
    const mobile = this.variant === "mobile";
    return html`
      <button
        class="nav-menu-item flex h-10 cursor-pointer items-center gap-2 rounded-full border border-white/20 px-3 text-white/85 transition-colors hover:border-white/40 hover:text-white [&.active]:text-white"
        data-page="page-account"
        title=${translateText("derpy.account_title")}
      >
        <svg
          class="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </svg>
        ${signedIn
          ? html`<span
                class="${mobile
                  ? "hidden"
                  : ""} max-w-32 truncate text-sm font-bold"
                >${this.username}</span
              >${this.coins !== null ? coinAmount(this.coins, "text-sm") : ""}`
          : html`<span class="text-xs font-bold uppercase tracking-widest"
              >${translateText("derpy.sign_in")}</span
            >`}
      </button>
    `;
  }
}
