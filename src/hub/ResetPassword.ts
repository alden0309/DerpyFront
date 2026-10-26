// ADMIN (r26): /reset-password#<link>: a one-time link the site's owner
// made for you (there's no email). Pick a new password; every place you
// were signed in is signed out, and this browser is signed in.

import { html, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { resetLinkOwner, resetPassword } from "../derpland/Account";
import { HubPage } from "./HubPage";

const PASSWORD_MIN = 6;

@customElement("dl-reset-password")
export class DerpResetPassword extends HubPage {
  /** The link's secret, taken from the address and then out of it. */
  private token = "";
  @state() private owner: string | null | undefined = undefined;
  @state() private error: string | null = null;
  @state() private busy = false;
  @state() private done: { username: string; signedIn: boolean } | null = null;

  connectedCallback(): void {
    this.token = location.hash.replace(/^#/, "");
    // Off the address bar and out of the history.
    if (location.hash) history.replaceState(null, "", location.pathname);
    super.connectedCallback();
  }

  protected async load(): Promise<void> {
    this.owner = /^[A-Za-z0-9_-]{30,100}$/.test(this.token)
      ? await resetLinkOwner(this.token)
      : null;
  }

  private async submit(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    const f = new FormData(e.target as HTMLFormElement);
    const a = String(f.get("password") ?? "");
    const b = String(f.get("again") ?? "");
    if (a.length < PASSWORD_MIN) {
      this.error = `Passwords need at least ${PASSWORD_MIN} characters.`;
      return;
    }
    if (a !== b) {
      this.error = "Those two aren't the same.";
      return;
    }
    this.busy = true;
    this.error = null;
    const r = await resetPassword(this.token, a);
    this.busy = false;
    if (r.ok) {
      this.done = r;
      return;
    }
    if (r.error === "link_gone") this.owner = null;
    else
      this.error =
        r.error === "invalid_password"
          ? `Passwords need at least ${PASSWORD_MIN} characters.`
          : "Something went wrong. Try again.";
  }

  render(): TemplateResult {
    return html`<section class="dl-panel dl-empty dl-signin-card">
      <h1 class="dl-h1">New password</h1>
      ${this.body()}
    </section>`;
  }

  private body(): TemplateResult {
    if (this.done)
      return html`<p>
          ${this.done.signedIn
            ? html`Done. You're signed in as <b>${this.done.username}</b>, and
                signed out everywhere else.`
            : html`Your password is changed, but this account can't sign in
              right now.`}
        </p>
        <a class="dl-btn" href="/">Go to Derp Land</a>`;
    if (this.owner === undefined) return html`<p>Checking the link…</p>`;
    if (this.owner === null)
      return html`<p>
          This link doesn't work any more. Each one works once, for a day. Ask
          for a new one.
        </p>
        <a class="dl-btn ghost" href="/">Go to Derp Land</a>`;
    return html`<p>
        Pick a new password for <b>${this.owner}</b>. Everywhere you're signed
        in now will be signed out.
      </p>
      <form
        class="dl-dialog-body"
        style="padding:0;width:100%;max-width:380px"
        @submit=${(e: SubmitEvent) => void this.submit(e)}
      >
        <div class="dl-field">
          <label for="rp-a">New password</label>
          <input
            id="rp-a"
            name="password"
            type="password"
            autocomplete="new-password"
            minlength=${PASSWORD_MIN}
            required
          />
        </div>
        <div class="dl-field">
          <label for="rp-b">The same again</label>
          <input
            id="rp-b"
            name="again"
            type="password"
            autocomplete="new-password"
            minlength=${PASSWORD_MIN}
            required
          />
        </div>
        ${this.error
          ? html`<p class="dl-name-error" role="alert">${this.error}</p>`
          : nothing}
        <div>
          <button class="dl-btn" ?disabled=${this.busy}>Set my password</button>
        </div>
      </form>`;
  }
}
