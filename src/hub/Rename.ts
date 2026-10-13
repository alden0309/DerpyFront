// NAMES (r20): changing your username, from your account page (the account
// menu's "Change username" opens it there). Shows your name, when you last
// changed it and when you next may, checks a new one as it's typed against
// the same rules as sign-up, then asks once more before changing it. Once a
// change goes through every page shows the new name, and you stay signed in.

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import {
  ApiError,
  changeUsername,
  checkName,
  NameStatus,
  nameStatus,
  RENAME_ERROR_TEXT,
} from "../derpland/Account";
import { closeIcon, tickIcon } from "../derpland/Icons";
import {
  formatWhen,
  NAME_CHANGE_DAYS,
  NAME_HOLD_DAYS,
  nextNameChange,
  USERNAME_MAX,
  USERNAME_MIN,
  USERNAME_RE,
} from "../derpland/Names";

type Step = "edit" | "confirm" | "done";

interface Check {
  /** The name this is about. */
  name: string;
  state: "idle" | "checking" | "ok" | "bad";
  text: string;
}

const IDLE: Check = { name: "", state: "idle", text: "" };

/** Fired (bubbling) once a change of name has gone through. */
export const RENAMED_EVENT = "dl-renamed";

@customElement("dl-rename")
export class DerpRename extends LitElement {
  @state() private status: NameStatus | null = null;
  @state() private loadError: string | null = null;
  @state() private step: Step = "edit";
  @state() private value = "";
  @state() private check: Check = IDLE;
  @state() private error: string | null = null;
  @state() private busy = false;
  /** The name before the change, for the last step. */
  @state() private was = "";

  @query("dialog") private dialog!: HTMLDialogElement;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: AbortController | null = null;

  createRenderRoot() {
    return this;
  }

  disconnectedCallback(): void {
    this.stopChecking();
    super.disconnectedCallback();
  }

  /** Open the form, fresh. */
  async open(): Promise<void> {
    this.step = "edit";
    this.value = "";
    this.check = IDLE;
    this.error = null;
    this.loadError = null;
    this.status = null;
    await this.updateComplete;
    if (!this.dialog.open) this.dialog.showModal();
    await this.refreshStatus();
    await this.updateComplete;
    this.querySelector<HTMLInputElement>("#dl-new-name")?.focus();
  }

  private close(): void {
    if (this.dialog?.open) this.dialog.close();
  }

  private onClosed = () => {
    this.stopChecking();
    // The account menu's link opens this with #username; leave the address
    // clean so the link opens it again next time.
    if (location.hash === "#username")
      history.replaceState(null, "", location.pathname + location.search);
  };

  private async refreshStatus(): Promise<void> {
    try {
      this.status = await nameStatus();
    } catch (e) {
      this.loadError =
        e instanceof ApiError && e.code === "accounts_unavailable"
          ? RENAME_ERROR_TEXT.accounts_unavailable
          : "Couldn't load your account. Close this and try again.";
    }
  }

  private stopChecking(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.inFlight?.abort();
    this.inFlight = null;
  }

  private onInput(e: InputEvent): void {
    this.value = (e.target as HTMLInputElement).value;
    this.error = null;
    this.stopChecking();
    const name = this.value.trim();
    const current = this.status?.username ?? "";
    if (name === "") {
      this.check = IDLE;
    } else if (/[^A-Za-z0-9_]/.test(name)) {
      this.check = {
        name,
        state: "bad",
        text: "Only letters, numbers and underscores.",
      };
    } else if (name.length < USERNAME_MIN) {
      this.check = {
        name,
        state: "idle",
        text: `At least ${USERNAME_MIN} characters.`,
      };
    } else if (name === current) {
      this.check = { name, state: "bad", text: RENAME_ERROR_TEXT.same_name };
    } else {
      this.check = { name, state: "checking", text: "Checking…" };
      this.timer = setTimeout(() => void this.ask(name), 300);
    }
  }

  /** The live check: is it free for you? */
  private async ask(name: string): Promise<void> {
    this.timer = null;
    const ctl = new AbortController();
    this.inFlight = ctl;
    try {
      const r = await checkName(name, ctl.signal);
      if (ctl.signal.aborted || this.value.trim() !== name) return;
      this.check = r.ok
        ? {
            name,
            state: "ok",
            text: r.caseOnly
              ? "Free. Only the capitals change, and that counts as a change."
              : `${name} is free.`,
          }
        : {
            name,
            state: "bad",
            text: RENAME_ERROR_TEXT[r.reason ?? "server_error"],
          };
    } catch {
      if (ctl.signal.aborted || this.value.trim() !== name) return;
      this.check = {
        name,
        state: "bad",
        text: "Couldn't check that name. Try again.",
      };
    } finally {
      if (this.inFlight === ctl) this.inFlight = null;
    }
  }

  private ready(): boolean {
    const name = this.value.trim();
    return (
      !this.busy &&
      this.status?.canChange === true &&
      USERNAME_RE.test(name) &&
      this.check.state === "ok" &&
      this.check.name === name
    );
  }

  private next(e: SubmitEvent): void {
    e.preventDefault();
    if (!this.ready()) return;
    this.step = "confirm";
  }

  private async confirm(): Promise<void> {
    const name = this.value.trim();
    const from = this.status?.username ?? "";
    this.busy = true;
    this.error = null;
    const r = await changeUsername(name);
    this.busy = false;
    if ("error" in r) {
      this.step = "edit";
      this.check = IDLE;
      this.error =
        r.error === "too_soon" && r.nextChangeAt
          ? `${RENAME_ERROR_TEXT.too_soon} You can change it again on ${formatWhen(r.nextChangeAt, { up: true })}.`
          : RENAME_ERROR_TEXT[r.error];
      await this.refreshStatus();
      return;
    }
    this.was = from;
    this.status = r;
    this.step = "done";
    this.dispatchEvent(
      new CustomEvent(RENAMED_EVENT, {
        bubbles: true,
        detail: { from, to: r.username },
      }),
    );
  }

  render(): TemplateResult {
    return html`<dialog
      class="dl-dialog dl-rename"
      aria-labelledby="dl-rename-title"
      @close=${this.onClosed}
    >
      ${this.step === "confirm"
        ? this.renderConfirm()
        : this.step === "done"
          ? this.renderDone()
          : this.renderEdit()}
    </dialog>`;
  }

  private head(title: string): TemplateResult {
    return html`<header class="dl-dialog-head">
      <h2 class="dl-dialog-title" id="dl-rename-title">${title}</h2>
      <button
        type="button"
        class="dl-dialog-x"
        aria-label="Close"
        @click=${() => this.close()}
      >
        ${closeIcon()}
      </button>
    </header>`;
  }

  private renderEdit(): TemplateResult {
    const s = this.status;
    if (this.loadError)
      return html`${this.head("Change your username")}
        <p class="dl-dialog-body dl-quiet">${this.loadError}</p>`;
    if (!s)
      return html`${this.head("Change your username")}
        <p class="dl-dialog-body dl-quiet">Loading…</p>`;
    const now = Date.now();
    const when = (iso: string, up = false) => formatWhen(iso, { now, up });
    const c = this.check;
    return html`${this.head("Change your username")}
      <form class="dl-dialog-body" @submit=${(e: SubmitEvent) => this.next(e)}>
        <dl class="dl-name-facts">
          <div>
            <dt>Your username</dt>
            <dd class="dl-name-now">${s.username}</dd>
          </div>
          <div>
            <dt>Last changed</dt>
            <dd>${s.changedAt ? when(s.changedAt) : "Never"}</dd>
          </div>
          <div>
            <dt>Next change</dt>
            <dd>
              ${s.canChange || !s.nextChangeAt
                ? "Any time"
                : when(s.nextChangeAt, true)}
            </dd>
          </div>
        </dl>

        ${s.canChange
          ? nothing
          : html`<p class="dl-name-wait" role="status">
              You can change it again on
              <b>${when(s.nextChangeAt ?? new Date(now).toISOString(), true)}</b
              >.
            </p>`}

        <div class="dl-field">
          <label for="dl-new-name">New username</label>
          <input
            id="dl-new-name"
            name="username"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            maxlength=${USERNAME_MAX}
            .value=${this.value}
            ?disabled=${!s.canChange || this.busy}
            aria-describedby="dl-name-check dl-name-rules"
            aria-invalid=${c.state === "bad" ? "true" : "false"}
            @input=${(e: InputEvent) => this.onInput(e)}
          />
          <p
            id="dl-name-check"
            class="dl-name-check ${c.state}"
            aria-live="polite"
          >
            ${c.state === "ok" ? tickIcon("dl-i") : nothing}${c.text}
          </p>
        </div>

        <ul class="dl-name-rules" id="dl-name-rules">
          <li>
            ${USERNAME_MIN} to ${USERNAME_MAX} letters, numbers or underscores.
          </li>
          <li>
            Not a name someone else has, or gave up in the last
            ${NAME_HOLD_DAYS} days.
          </li>
          <li>
            Once every ${NAME_CHANGE_DAYS} days. Changing only the capitals
            counts.
          </li>
        </ul>

        ${s.heldName && s.heldUntil
          ? html`<p class="dl-name-note">
              Your old name, ${s.heldName}, is kept for you until
              ${when(s.heldUntil, true)}.
            </p>`
          : nothing}
        ${this.error
          ? html`<p class="dl-name-error" role="alert">${this.error}</p>`
          : nothing}

        <div class="dl-dialog-actions">
          <button
            type="button"
            class="dl-btn ghost"
            @click=${() => this.close()}
          >
            Cancel
          </button>
          <button class="dl-btn" ?disabled=${!this.ready()}>Continue</button>
        </div>
      </form>`;
  }

  private renderConfirm(): TemplateResult {
    const s = this.status!;
    const name = this.value.trim();
    // The 7 days run from the minute of the change (the server's own clock
    // has the last word, shown once it's done).
    const until = formatWhen(nextNameChange(Date.now()));
    const caseOnly = name.toLowerCase() === s.username.toLowerCase();
    return html`${this.head(`Change to ${name}?`)}
      <div class="dl-dialog-body">
        <p class="dl-name-swap">
          <span class="dl-name-old">${s.username}</span>
          <span class="dl-name-arrow" aria-label="becomes">→</span>
          <span class="dl-name-new">${name}</span>
        </p>
        <ul class="dl-name-points">
          <li>
            ${name} shows everywhere straight away: the leaderboards, latest
            games, your stats and replays, and your saved games.
          </li>
          <li>You sign in as ${name} from now on. You stay signed in here.</li>
          ${caseOnly
            ? nothing
            : html`<li>
                Nobody else can take ${s.username} for ${NAME_HOLD_DAYS} days.
              </li>`}
          <li class="dl-name-strong">
            You can't change it again for ${NAME_CHANGE_DAYS} days, until
            ${until}.
          </li>
        </ul>
        <div class="dl-dialog-actions">
          <button
            type="button"
            class="dl-btn ghost"
            ?disabled=${this.busy}
            @click=${() => (this.step = "edit")}
          >
            Back
          </button>
          <button
            type="button"
            class="dl-btn"
            ?disabled=${this.busy}
            @click=${() => void this.confirm()}
          >
            ${this.busy ? "Changing…" : `Change to ${name}`}
          </button>
        </div>
      </div>`;
  }

  private renderDone(): TemplateResult {
    const s = this.status!;
    return html`${this.head(`You're ${s.username} now`)}
      <div class="dl-dialog-body">
        <p class="dl-name-swap done">
          <span class="dl-name-old">${this.was}</span>
          <span class="dl-name-arrow" aria-hidden="true">→</span>
          <span class="dl-name-new">${s.username}</span>
        </p>
        <p class="dl-quiet">
          Sign in as ${s.username} from now on.
          ${s.nextChangeAt
            ? html`You can change it again on
                <b>${formatWhen(s.nextChangeAt, { up: true })}</b>.`
            : nothing}
        </p>
        <div class="dl-dialog-actions">
          <button type="button" class="dl-btn" @click=${() => this.close()}>
            Done
          </button>
        </div>
      </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dl-rename": DerpRename;
  }
}
