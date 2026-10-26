// ADMIN (r26): the admin page's frame: who's signed in (and how fresh that
// is), the sections down the side (a row of chips on a phone), the address
// (/admin/<section>/...), and the dialogs every section shares: confirming,
// typing the password again, and short notes at the bottom.

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import {
  DERPY_ACCOUNT_EVENT,
  DERPY_API,
  derpyToken,
} from "../client/derpy/DerpySession";
import { openSignIn } from "../derpland/DerpBar";
import { closeIcon } from "../derpland/Icons";
import {
  AdminError,
  AdminView,
  ConfirmAsk,
  findSection,
  topSections,
} from "./Registry";
import { ago, errorText, pill, when } from "./ui";

interface Hello {
  owner: { id: number; username: string };
  fresh: boolean;
  freshUntil: string;
  sections: string[];
}

interface Route {
  section: string;
  rest: string[];
  query: URLSearchParams;
}

export function routeOf(loc: { pathname: string; search: string }): Route {
  const parts = loc.pathname
    .replace(/^\/admin\/?/, "")
    .split("/")
    .filter(Boolean)
    .map((p) => decodeURIComponent(p));
  return {
    section: parts[0] ?? "overview",
    rest: parts.slice(1),
    query: new URLSearchParams(loc.search),
  };
}

/** One call to the admin API; throws AdminError when it isn't OK. */
export async function adminFetch<T>(
  method: "GET" | "POST",
  path: string,
  body?: object,
): Promise<T> {
  const token = derpyToken();
  // A section may write "/pictures/" or "pictures/": both are
  // /derpy/api/admin/pictures/ (never /derpy/api/adminpictures/).
  const at = path.startsWith("/") ? path : `/${path}`;
  const res = await fetch(`${DERPY_API}/admin${at}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let code = "server_error";
    try {
      code = ((await res.json()) as { error?: string }).error ?? code;
    } catch {
      // not JSON
    }
    throw new AdminError(code, res.status);
  }
  return (await res.json()) as T;
}

/** Opens a modal dialog (where the browser has them). */
function openDialog(d: HTMLDialogElement | undefined): void {
  if (d && !d.open && typeof d.showModal === "function") d.showModal();
}

function shutDialog(d: HTMLDialogElement | undefined): void {
  if (d?.open && typeof d.close === "function") d.close();
}

interface Toast {
  id: number;
  text: string;
  tone: "good" | "bad" | "";
}

@customElement("dl-admin")
export class AdminApp extends LitElement {
  @state() private hello: Hello | null = null;
  @state() private failed: "signed_out" | "error" | null = null;
  @state() private route: Route = routeOf(location);
  @state() private toasts: Toast[] = [];
  @state() private ask:
    | (ConfirmAsk & { done: (v: false | { reason: string }) => void })
    | null = null;
  @state() private typed = "";
  @state() private reason = "";
  @state() private reauth: { done: (ok: boolean) => void } | null = null;
  @state() private reauthError: string | null = null;
  @state() private reauthBusy = false;

  @query("dialog.adm-confirm") private confirmDialog?: HTMLDialogElement;
  @query("dialog.adm-reauth") private reauthDialog?: HTMLDialogElement;

  private toastSeq = 0;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("popstate", this.onPop);
    window.addEventListener(DERPY_ACCOUNT_EVENT, this.onAccount);
    this.addEventListener("click", this.onClick);
    void this.load();
  }

  disconnectedCallback(): void {
    window.removeEventListener("popstate", this.onPop);
    window.removeEventListener(DERPY_ACCOUNT_EVENT, this.onAccount);
    this.removeEventListener("click", this.onClick);
    super.disconnectedCallback();
  }

  private onPop = () => {
    this.route = routeOf(location);
  };

  private onAccount = () => void this.load();

  /** Links to other admin pages stay in the page. */
  private onClick = (e: MouseEvent) => {
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    )
      return;
    const a = (e.target as Element).closest?.("a");
    const href = a?.getAttribute("href");
    if (!a || !href || a.target === "_blank" || !/^\/admin(\/|\?|$)/.test(href))
      return;
    e.preventDefault();
    this.go(href);
  };

  private async load(): Promise<void> {
    if (!derpyToken()) {
      this.hello = null;
      this.failed = "signed_out";
      return;
    }
    try {
      this.hello = await adminFetch<Hello>("GET", "/hello");
      this.failed = null;
    } catch (err) {
      this.hello = null;
      this.failed =
        err instanceof AdminError && (err.status === 404 || err.status === 401)
          ? "signed_out"
          : "error";
    }
  }

  go(href: string, opts: { replace?: boolean } = {}): void {
    if (opts.replace) history.replaceState(null, "", href);
    else history.pushState(null, "", href);
    this.route = routeOf(location);
    window.scrollTo({ top: 0 });
  }

  toast(text: string, tone: "good" | "bad" | "" = ""): void {
    const id = ++this.toastSeq;
    this.toasts = [...this.toasts, { id, text, tone }].slice(-3);
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    }, 4500);
  }

  private confirm(ask: ConfirmAsk): Promise<false | { reason: string }> {
    this.ask?.done(false);
    this.typed = "";
    this.reason = ask.reasonValue ?? "";
    return new Promise((done) => {
      this.ask = { ...ask, done };
      void this.updateComplete.then(() => openDialog(this.confirmDialog));
    });
  }

  private closeConfirm(v: false | { reason: string }): void {
    const a = this.ask;
    this.ask = null;
    shutDialog(this.confirmDialog);
    a?.done(v);
  }

  /** The password again; resolves true when the server took it. */
  private askPassword(): Promise<boolean> {
    this.reauth?.done(false);
    this.reauthError = null;
    return new Promise((done) => {
      this.reauth = { done };
      void this.updateComplete.then(() => openDialog(this.reauthDialog));
    });
  }

  private closeReauth(ok: boolean): void {
    const r = this.reauth;
    this.reauth = null;
    shutDialog(this.reauthDialog);
    r?.done(ok);
  }

  private async submitReauth(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const password = String(new FormData(form).get("password") ?? "");
    this.reauthBusy = true;
    try {
      const r = await adminFetch<{ freshUntil: string }>("POST", "/reauth", {
        password,
      });
      if (this.hello)
        this.hello = { ...this.hello, fresh: true, freshUntil: r.freshUntil };
      form.reset();
      this.closeReauth(true);
    } catch (err) {
      this.reauthError =
        err instanceof AdminError
          ? errorText(err.code)
          : errorText("server_error");
    } finally {
      this.reauthBusy = false;
    }
  }

  /** What each section is given. */
  private view(path: string[] = this.route.rest): AdminView {
    const r = this.route;
    return {
      path,
      query: r.query,
      owner: this.hello!.owner,
      get: <T>(path: string) => adminFetch<T>("GET", path),
      post: async <T>(path: string, body: object = {}) => {
        try {
          return await adminFetch<T>("POST", path, body);
        } catch (err) {
          if (!(err instanceof AdminError) || err.code !== "stale_sign_in")
            throw err;
          if (!(await this.askPassword())) throw err;
          return adminFetch<T>("POST", path, body);
        }
      },
      confirm: (ask) => this.confirm(ask),
      toast: (text, tone) => this.toast(text, tone),
      go: (href, opts) => this.go(href, opts),
    };
  }

  render(): TemplateResult {
    if (this.failed === "signed_out")
      return html`<div class="dl-panel dl-empty">
        <h1 class="dl-h1">Sign in</h1>
        <p>Sign in to use this page.</p>
        <button class="dl-btn" @click=${() => openSignIn("signin")}>
          Sign in
        </button>
      </div>`;
    if (this.failed === "error")
      return html`<div class="dl-panel dl-empty">
        <p>The server didn't answer. Try again in a moment.</p>
        <button class="dl-btn ghost" @click=${() => void this.load()}>
          Try again
        </button>
      </div>`;
    if (!this.hello) return html`<p class="adm-quiet">Loading…</p>`;
    const r = this.route;
    const sections = topSections();
    const asked = findSection(r.section);
    // A tab of another section's page (/admin/names) is that page, on it.
    const current = asked?.parent ? findSection(asked.parent) : asked;
    const path = asked?.parent ? [asked.id, ...r.rest] : r.rest;
    const lit = current?.id ?? r.section;
    return html`
      <div class="adm-shell">
        <nav class="adm-nav" aria-label="Admin">
          <div class="adm-who">
            <div class="adm-who-title">Admin</div>
            <div class="adm-who-name">${this.hello.owner.username}</div>
            <div class="adm-fresh">${this.freshPill()}</div>
          </div>
          ${sections.map(
            (s) =>
              html`<a
                class="adm-navlink"
                href="/admin/${s.id === "overview" ? "" : s.id}"
                aria-current=${lit === s.id ? "page" : "false"}
                >${s.icon?.() ?? nothing}<span>${s.label}</span></a
              >`,
          )}
        </nav>
        <section class="adm-page">
          ${current
            ? current.render(this.view(path))
            : html`<div class="adm-head"><h1>No such page</h1></div>
                <p class="adm-quiet">
                  <a class="adm-link" href="/admin">Back to the Overview</a>
                </p>`}
        </section>
      </div>
      ${this.renderConfirm()} ${this.renderReauth()}
      <div class="adm-toasts" aria-live="polite">
        ${this.toasts.map(
          (t) => html`<div class="adm-toast ${t.tone}">${t.text}</div>`,
        )}
      </div>
    `;
  }

  private freshPill(): TemplateResult {
    const h = this.hello!;
    const until = Date.parse(h.freshUntil);
    if (h.fresh && until > Date.now())
      return html`<span
        title="Bans, deletes, renames and big coin changes need a sign-in from the last 12 hours"
        >${pill(
          `Signed in: until ${when(until).split(", ").pop()}`,
          "good",
        )}</span
      >`;
    return html`<button
      class="adm-link adm-small"
      title="Bans, deletes, renames and big coin changes need a sign-in from the last 12 hours"
      @click=${async () => {
        if (await this.askPassword())
          this.toast("Thanks. Good for 12 hours.", "good");
      }}
    >
      Confirm your password
    </button>`;
  }

  private renderConfirm(): TemplateResult {
    const a = this.ask;
    const ok =
      a !== null &&
      (a.typed === undefined || this.typed.trim() === a.typed) &&
      (!a.reasonRequired || this.reason.trim().length > 0);
    return html`<dialog
      class="dl-dialog adm-dialog adm-confirm"
      @cancel=${(e: Event) => {
        e.preventDefault();
        this.closeConfirm(false);
      }}
    >
      ${a
        ? html`<div class="dl-dialog-head">
              <h2 class="dl-dialog-title">${a.title}</h2>
              <button
                class="dl-dialog-x"
                aria-label="Close"
                @click=${() => this.closeConfirm(false)}
              >
                ${closeIcon()}
              </button>
            </div>
            <form
              class="dl-dialog-body"
              @submit=${(e: SubmitEvent) => {
                e.preventDefault();
                if (ok) this.closeConfirm({ reason: this.reason.trim() });
              }}
            >
              ${a.body ? html`<p>${a.body}</p>` : nothing}
              ${a.reason
                ? html`<div class="dl-field">
                    <label for="adm-reason"
                      >${typeof a.reason === "string"
                        ? a.reason
                        : "Reason"}${a.reasonRequired
                        ? ""
                        : " (optional)"}</label
                    >
                    <input
                      id="adm-reason"
                      maxlength="300"
                      autocomplete="off"
                      .value=${this.reason}
                      @input=${(e: InputEvent) =>
                        (this.reason = (e.target as HTMLInputElement).value)}
                    />
                  </div>`
                : nothing}
              ${a.typed !== undefined
                ? html`<div class="dl-field">
                    <label for="adm-typed"
                      >Type <span class="adm-typed">${a.typed}</span> to go
                      ahead</label
                    >
                    <input
                      id="adm-typed"
                      autocomplete="off"
                      spellcheck="false"
                      .value=${this.typed}
                      @input=${(e: InputEvent) =>
                        (this.typed = (e.target as HTMLInputElement).value)}
                    />
                  </div>`
                : nothing}
              <div class="dl-dialog-actions">
                <button
                  type="button"
                  class="dl-btn ghost"
                  @click=${() => this.closeConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  class="dl-btn ${a.danger ? "adm-danger" : ""}"
                  ?disabled=${!ok}
                >
                  ${a.action}
                </button>
              </div>
            </form>`
        : nothing}
    </dialog>`;
  }

  private renderReauth(): TemplateResult {
    return html`<dialog
      class="dl-dialog adm-dialog adm-reauth"
      @cancel=${(e: Event) => {
        e.preventDefault();
        this.closeReauth(false);
      }}
    >
      ${this.reauth
        ? html`<div class="dl-dialog-head">
              <h2 class="dl-dialog-title">Your password again</h2>
              <button
                class="dl-dialog-x"
                aria-label="Close"
                @click=${() => this.closeReauth(false)}
              >
                ${closeIcon()}
              </button>
            </div>
            <form
              class="dl-dialog-body"
              @submit=${(e: SubmitEvent) => void this.submitReauth(e)}
            >
              <p>
                Bans, deletes, renames and big coin changes need a sign-in from
                the last 12 hours. You signed in
                ${ago(
                  this.hello?.freshUntil
                    ? Date.parse(this.hello.freshUntil) - 12 * 3600_000
                    : null,
                )}.
              </p>
              <div class="dl-field">
                <label for="adm-pw">Password</label>
                <input
                  id="adm-pw"
                  name="password"
                  type="password"
                  autocomplete="current-password"
                  required
                />
              </div>
              ${this.reauthError
                ? html`<p class="adm-err" role="alert">${this.reauthError}</p>`
                : nothing}
              <div class="dl-dialog-actions">
                <button
                  type="button"
                  class="dl-btn ghost"
                  @click=${() => this.closeReauth(false)}
                >
                  Cancel
                </button>
                <button class="dl-btn" ?disabled=${this.reauthBusy}>
                  Confirm
                </button>
              </div>
            </form>`
        : nothing}
    </dialog>`;
  }
}
