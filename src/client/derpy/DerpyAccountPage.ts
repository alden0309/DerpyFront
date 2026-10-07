import { html, TemplateResult } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { BaseModal } from "../components/BaseModal";
import { modalHeader } from "../components/ui/ModalHeader";
import { translateText } from "../Utils";
import {
  DERPY_ACCOUNT_EVENT,
  DerpyAuthError,
  derpyCreateAccount,
  derpyMe,
  derpySignIn,
  derpySignOut,
  derpyUsername,
} from "./DerpyAccount";
import "./DerpyProfileView";
import type { DerpyProfileView } from "./DerpyProfileView";

type Mode = "sign_in" | "create";

/**
 * The account page. Signed out: sign in or create an account. Signed in:
 * your stats, Derp Coins and saved games (with replays).
 */
@customElement("derpy-account-page")
export class DerpyAccountPage extends BaseModal {
  protected routerName = "account";

  @state() private username: string | null = derpyUsername();
  @state() private mode: Mode = "sign_in";
  @state() private error: DerpyAuthError | null = null;
  @state() private busy = false;

  @query("derpy-profile-view") private profileView?: DerpyProfileView;

  private onAccountChanged = () => {
    this.username = derpyUsername();
    void this.refreshAccount();
  };

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(DERPY_ACCOUNT_EVENT, this.onAccountChanged);
  }

  disconnectedCallback(): void {
    window.removeEventListener(DERPY_ACCOUNT_EVENT, this.onAccountChanged);
    super.disconnectedCallback();
  }

  protected onOpen(): void {
    this.username = derpyUsername();
    this.error = null;
    void this.refreshAccount();
    void this.profileView?.reload();
  }

  private async refreshAccount(): Promise<void> {
    // A session that ended elsewhere signs this page out too.
    const me = await derpyMe();
    if (me === null) this.username = derpyUsername();
  }

  protected renderHeaderSlot(): TemplateResult {
    return modalHeader({
      title: translateText("derpy.account_title"),
      onBack: () => this.close(),
      ariaLabel: translateText("common.close"),
      rightContent:
        this.username !== null
          ? html`<button
              class="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/15 hover:text-white"
              @click=${() => this.signOut()}
            >
              ${translateText("derpy.sign_out")}
            </button>`
          : undefined,
    });
  }

  protected renderBody(): TemplateResult {
    if (this.username !== null) {
      return html`<derpy-profile-view
        .username=${this.username}
      ></derpy-profile-view>`;
    }
    return this.renderSignIn();
  }

  private renderSignIn(): TemplateResult {
    const creating = this.mode === "create";
    const tab = (mode: Mode, label: string) =>
      html`<button
        type="button"
        class="flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${this
          .mode === mode
          ? "bg-white text-zinc-900"
          : "text-white/60 hover:text-white"}"
        @click=${() => {
          this.mode = mode;
          this.error = null;
        }}
      >
        ${label}
      </button>`;
    return html`
      <div class="flex justify-center p-4 lg:p-10">
        <form
          class="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-6"
          @submit=${(e: SubmitEvent) => this.submit(e)}
        >
          <div class="flex gap-1 rounded-xl bg-black/30 p-1">
            ${tab("sign_in", translateText("derpy.sign_in"))}
            ${tab("create", translateText("derpy.create_account"))}
          </div>
          <p class="m-0 text-sm leading-relaxed text-white/60">
            ${translateText(
              creating ? "derpy.create_blurb" : "derpy.sign_in_blurb",
            )}
          </p>
          <label
            class="flex flex-col gap-1 text-sm font-semibold text-white/80"
          >
            ${translateText("derpy.username")}
            <input
              name="username"
              autocomplete="username"
              required
              minlength="3"
              maxlength="20"
              pattern="[A-Za-z0-9_]{3,20}"
              class="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-base font-normal text-white outline-none focus:border-cyber-yellow"
            />
          </label>
          <label
            class="flex flex-col gap-1 text-sm font-semibold text-white/80"
          >
            ${translateText("derpy.password")}
            <input
              name="password"
              type="password"
              autocomplete=${creating ? "new-password" : "current-password"}
              required
              minlength="6"
              class="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-base font-normal text-white outline-none focus:border-cyber-yellow"
            />
          </label>
          ${creating
            ? html`<p class="m-0 text-xs text-white/45">
                ${translateText("derpy.username_rules")}
              </p>`
            : ""}
          ${this.error
            ? html`<p
                role="alert"
                class="m-0 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200"
              >
                ${translateText(`derpy.error_${this.error}`)}
              </p>`
            : ""}
          <button
            type="submit"
            ?disabled=${this.busy}
            class="rounded-xl bg-cyber-yellow px-4 py-3 text-base font-black text-zinc-900 transition-opacity disabled:opacity-50"
          >
            ${translateText(
              creating ? "derpy.create_account" : "derpy.sign_in",
            )}
          </button>
        </form>
      </div>
    `;
  }

  private async submit(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = new FormData(form);
    const username = String(data.get("username") ?? "").trim();
    const password = String(data.get("password") ?? "");
    this.busy = true;
    this.error = null;
    const err =
      this.mode === "create"
        ? await derpyCreateAccount(username, password)
        : await derpySignIn(username, password);
    this.busy = false;
    if (err !== null) {
      this.error = err;
      return;
    }
    form.reset();
    this.username = derpyUsername();
    void this.refreshAccount();
  }

  private async signOut(): Promise<void> {
    await derpySignOut();
    this.username = null;
    this.mode = "sign_in";
  }
}
