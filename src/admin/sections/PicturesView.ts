// PROFILE (r26): the admin page's profile pictures, page side. Two tabs
// under Moderation (ADMIN r26's registry: `parent: "moderation"`):
//
// - Pictures: the latest uploads, each with Remove (it's gone at once,
//   everywhere, and the account wears its initial again), Remove and block
//   uploads, and Block or Allow uploads; then the accounts blocked from
//   uploading.
// - Reports: pictures someone reported, by whom and when, with Keep it
//   (the reports go) and the same Remove.
//
// And a panel on each account's admin page (pictureAccountPanel). The
// server's half is admin/sections/Pictures.ts; the work itself is in
// DerpyPictures.ts. Only the admin page's own script loads this: no public
// page imports anything under src/admin.

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { avatar } from "../../derpland/Avatar";
import type {
  AccountPicture,
  ModerationRow,
  ModerationView,
} from "../../derpland/Pictures";
import "../../hub/looks.css";
import "./pictures.css";

/** What the sections use of the admin page's view (ADMIN's AdminView fits it). */
export interface PicturesAdminView {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: object): Promise<T>;
  confirm(ask: {
    title: string;
    body?: string;
    action: string;
    danger?: boolean;
    reason?: boolean | string;
  }): Promise<false | { reason: string }>;
  toast(text: string, tone?: "good" | "bad"): void;
  go(href: string): void;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** Asks, then removes an account's picture (and blocks it, if asked to). */
export async function removeAsked(
  view: PicturesAdminView,
  row: { accountId: number; username: string },
  block: boolean,
): Promise<Partial<ModerationView> | null> {
  const ok = await view.confirm({
    title: block
      ? `Remove ${row.username}'s picture and block uploads?`
      : `Remove ${row.username}'s picture?`,
    body: block
      ? "It's gone at once, everywhere: they wear their initial again, and can't upload another until you allow it. They can still pick a preset."
      : "It's gone at once, everywhere: they wear their initial again. They can upload another.",
    action: block ? "Remove and block" : "Remove picture",
    danger: true,
    reason: true,
  });
  if (ok === false) return null;
  try {
    const r = await view.post<Partial<ModerationView>>(
      `pictures/${row.accountId}/remove`,
      { block, reason: ok.reason || null },
    );
    view.toast(`${row.username}'s picture is gone.`, "good");
    return r;
  } catch {
    view.toast("That didn't work. Try again.", "bad");
    return null;
  }
}

async function setBlocked(
  view: PicturesAdminView,
  row: { accountId: number; username: string },
  blocked: boolean,
): Promise<Partial<ModerationView> | null> {
  const ok = await view.confirm({
    title: blocked
      ? `Stop ${row.username} uploading pictures?`
      : `Let ${row.username} upload pictures again?`,
    body: blocked
      ? "Their picture stays as it is. They can still pick a preset."
      : undefined,
    action: blocked ? "Block uploads" : "Allow uploads",
    danger: blocked,
    reason: blocked,
  });
  if (ok === false) return null;
  try {
    const r = await view.post<Partial<ModerationView>>(
      `pictures/${row.accountId}/block`,
      { blocked, reason: ok.reason || null },
    );
    view.toast(
      blocked
        ? `${row.username} can't upload pictures now.`
        : `${row.username} can upload pictures again.`,
      "good",
    );
    return r;
  } catch {
    view.toast("That didn't work. Try again.", "bad");
    return null;
  }
}

function card(
  view: PicturesAdminView,
  r: ModerationRow,
  acts: TemplateResult,
  showReports: boolean,
): TemplateResult {
  return html`<li class="adm-pic">
    ${avatar(r.username, r.picture, "adm-pic-img")}
    <div class="adm-pic-text">
      <a
        class="adm-pic-name"
        href="/admin/accounts/${r.accountId}"
        @click=${(e: MouseEvent) => {
          e.preventDefault();
          view.go(`/admin/accounts/${r.accountId}`);
        }}
        >${r.username}</a
      >
      <span class="adm-pic-meta"
        >Uploaded ${when(r.uploadedAt)}${r.worn ? "" : " · not worn now"}</span
      >
      ${r.blocked
        ? html`<span class="adm-pic-tag bad">Uploads blocked</span>`
        : nothing}
      ${showReports && r.reports > 0
        ? html`<span class="adm-pic-reports"
            >Reported by
            ${r.reporters.join(", ")}${r.lastReportAt
              ? html`, last ${when(r.lastReportAt)}`
              : nothing}</span
          >`
        : !showReports && r.reports > 0
          ? html`<span class="adm-pic-tag"
              >${r.reports} ${r.reports === 1 ? "report" : "reports"}</span
            >`
          : nothing}
    </div>
    <div class="adm-pic-acts">${acts}</div>
  </li>`;
}

/** Moderation → Pictures: the latest uploads, and who may not upload. */
@customElement("adm-pictures")
export class AdmPictures extends LitElement {
  @property({ attribute: false }) view!: PicturesAdminView;
  @state() private data: Partial<ModerationView> | null = null;
  @state() private failed = false;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.data = await this.view.get<Partial<ModerationView>>("pictures/");
      this.failed = false;
    } catch {
      this.failed = true;
    }
  }

  private take(r: Partial<ModerationView> | null): void {
    if (r) this.data = { ...this.data, ...r };
  }

  render(): TemplateResult {
    if (this.failed)
      return html`<p class="dl-panel dl-quiet">Couldn't load the pictures.</p>`;
    const d = this.data;
    if (!d) return html`<p class="dl-quiet">Loading…</p>`;
    const recent = d.recent ?? [];
    const blocked = d.blocked ?? [];
    return html`<section class="dl-panel adm-pics">
        <h2 class="dl-h2">Latest uploads</h2>
        <p class="adm-pics-note">
          Every uploaded picture is drawn again by the server at 256 pixels,
          with nothing else from the file kept. Remove takes it down at once,
          everywhere.
        </p>
        ${recent.length === 0
          ? html`<p class="dl-quiet">Nobody has uploaded a picture yet.</p>`
          : html`<ul class="adm-pic-list">
              ${recent.map((r) =>
                card(
                  this.view,
                  r,
                  html`<button
                      class="dl-btn small ghost"
                      @click=${async () =>
                        this.take(await removeAsked(this.view, r, false))}
                    >
                      Remove
                    </button>
                    <button
                      class="dl-btn small ghost adm-danger"
                      @click=${async () =>
                        this.take(await removeAsked(this.view, r, true))}
                    >
                      Remove and block
                    </button>
                    ${r.blocked
                      ? nothing
                      : html`<button
                          class="dl-btn small ghost"
                          @click=${async () =>
                            this.take(await setBlocked(this.view, r, true))}
                        >
                          Block uploads
                        </button>`}`,
                  false,
                ),
              )}
            </ul>`}
      </section>
      <section class="dl-panel adm-pics">
        <h2 class="dl-h2">Blocked from uploading</h2>
        ${blocked.length === 0
          ? html`<p class="dl-quiet">Nobody.</p>`
          : html`<ul class="adm-blocked">
              ${blocked.map(
                (b) =>
                  html`<li>
                    <span>${b.username}</span>
                    <button
                      class="dl-btn small ghost"
                      @click=${async () =>
                        this.take(await setBlocked(this.view, b, false))}
                    >
                      Allow uploads
                    </button>
                  </li>`,
              )}
            </ul>`}
      </section>`;
  }
}

/** Moderation → Reports: reported pictures, newest report first. */
@customElement("adm-picture-reports")
export class AdmPictureReports extends LitElement {
  @property({ attribute: false }) view!: PicturesAdminView;
  @state() private reported: ModerationRow[] | null = null;
  @state() private failed = false;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const r = await this.view.get<Partial<ModerationView>>("reports/");
      this.reported = r.reported ?? [];
      this.failed = false;
    } catch {
      this.failed = true;
    }
  }

  private async keep(r: ModerationRow): Promise<void> {
    const ok = await this.view.confirm({
      title: `Keep ${r.username}'s picture?`,
      body: "Its reports are cleared. The picture stays.",
      action: "Keep it",
      reason: true,
    });
    if (ok === false) return;
    try {
      const res = await this.view.post<Partial<ModerationView>>(
        `reports/${r.accountId}/dismiss`,
        { version: r.version, reason: ok.reason || null },
      );
      this.reported = res.reported ?? this.reported;
      this.view.toast(`Kept ${r.username}'s picture.`, "good");
    } catch {
      this.view.toast("That didn't work. Try again.", "bad");
    }
  }

  render(): TemplateResult {
    if (this.failed)
      return html`<p class="dl-panel dl-quiet">Couldn't load the reports.</p>`;
    const list = this.reported;
    if (!list) return html`<p class="dl-quiet">Loading…</p>`;
    return html`<section class="dl-panel adm-pics">
      <h2 class="dl-h2">
        Reported pictures
        <span class="adm-pics-count">${list.length}</span>
      </h2>
      ${list.length === 0
        ? html`<p class="dl-quiet">Nothing reported. All quiet.</p>`
        : html`<ul class="adm-pic-list">
            ${list.map((r) =>
              card(
                this.view,
                r,
                html`<button
                    class="dl-btn small ghost"
                    @click=${() => void this.keep(r)}
                  >
                    Keep it
                  </button>
                  <button
                    class="dl-btn small ghost"
                    @click=${async () => {
                      if (await removeAsked(this.view, r, false))
                        await this.load();
                    }}
                  >
                    Remove
                  </button>
                  <button
                    class="dl-btn small ghost adm-danger"
                    @click=${async () => {
                      if (await removeAsked(this.view, r, true))
                        await this.load();
                    }}
                  >
                    Remove and block
                  </button>`,
                true,
              ),
            )}
          </ul>`}
    </section>`;
  }
}

/** The panel on an account's admin page: its picture and its uploads. */
export function pictureAccountPanel(
  account: { id: number; username: string },
  data: unknown,
  view: PicturesAdminView,
  reload: () => void,
): TemplateResult {
  const d = data as AccountPicture | undefined;
  if (!d) return html`<p class="dl-quiet">No picture.</p>`;
  const row = { accountId: account.id, username: account.username };
  return html`<div class="adm-acct-pic">
    ${avatar(account.username, d.picture, "adm-pic-img")}
    <div class="adm-pic-text">
      <span
        >${d.upload
          ? d.upload.worn
            ? "Wears their own upload"
            : "Has an upload they don't wear"
          : d.picture
            ? "Wears a preset"
            : "Wears their initial"}</span
      >
      ${d.upload
        ? html`<span class="adm-pic-meta"
            >Uploaded
            ${when(d.upload.uploadedAt)}${d.upload.reports
              ? ` · ${d.upload.reports} ${d.upload.reports === 1 ? "report" : "reports"}`
              : ""}</span
          >`
        : nothing}
      <span class="adm-pic-meta"
        >${d.uploadsToday} uploads
        today${d.uploadsBlocked ? " · uploads blocked" : ""}</span
      >
    </div>
    <div class="adm-pic-acts">
      ${d.upload
        ? html`<button
            class="dl-btn small ghost"
            @click=${async () => {
              if (await removeAsked(view, row, false)) reload();
            }}
          >
            Remove picture
          </button>`
        : nothing}
      <button
        class="dl-btn small ghost ${d.uploadsBlocked ? "" : "adm-danger"}"
        @click=${async () => {
          if (await setBlocked(view, row, !d.uploadsBlocked)) reload();
        }}
      >
        ${d.uploadsBlocked ? "Allow uploads" : "Block uploads"}
      </button>
    </div>
  </div>`;
}

declare global {
  interface HTMLElementTagNameMap {
    "adm-pictures": AdmPictures;
    "adm-picture-reports": AdmPictureReports;
  }
}
