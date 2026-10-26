// ADMIN (r26): the site banner: one line under the top bar on every page
// with the bar, with an optional link and end time, on or off. Viewers can
// dismiss it (a new or changed banner shows again).

import { html, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  BANNER_LINK_RE,
  BANNER_LINK_TEXT_MAX,
  BANNER_TEXT_MAX,
} from "../../derpland/BannerTypes";
import { closeIcon } from "../../derpland/Icons";
import { flagBannerIcon } from "../icons";
import { AdminPage } from "../Page";
import { registerSection } from "../Registry";
import { ago, pill, when } from "../ui";

interface Setting {
  enabled: boolean;
  text: string;
  link: string | null;
  linkText: string | null;
  endsAt: string | null;
  version: number;
  updatedAt: string | null;
}

/** A datetime-local input's value for a moment, in the viewer's time. */
function localInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

@customElement("adm-banner")
export class AdminBanner extends AdminPage {
  @state() private setting: Setting | null = null;
  @state() private showing: unknown = null;
  @state() private enabled = false;
  @state() private text = "";
  @state() private link = "";
  @state() private linkText = "";
  @state() private endsAt = "";

  protected async fetch(): Promise<void> {
    const r = await this.view.get<{ setting: Setting; showing: unknown }>(
      "/banner",
    );
    this.setting = r.setting;
    this.showing = r.showing;
    this.enabled = r.setting.enabled;
    this.text = r.setting.text;
    this.link = r.setting.link ?? "";
    this.linkText = r.setting.linkText ?? "";
    this.endsAt = localInput(r.setting.endsAt);
  }

  private problem(): string | null {
    if (this.enabled && !this.text.trim()) return "A banner needs some text.";
    if (this.link.trim() && !BANNER_LINK_RE.test(this.link.trim()))
      return "A link is a page here (/store) or an https:// address.";
    if (
      this.enabled &&
      this.endsAt &&
      new Date(this.endsAt).getTime() <= Date.now()
    )
      return "The end time has already passed.";
    return null;
  }

  private async save(): Promise<void> {
    const end = this.endsAt ? new Date(this.endsAt) : null;
    const ok = await this.view.confirm({
      title: this.enabled ? "Show this banner" : "Turn the banner off",
      body: this.enabled
        ? `Every page with the top bar shows it within about 15 seconds${end ? `, until ${when(end.getTime())}` : ""}. Anyone who closed the last one sees this one.`
        : "It's gone from every page within about 15 seconds.",
      action: this.enabled ? "Show it" : "Turn it off",
    });
    if (!ok) return;
    await this.act(
      () =>
        this.view.post("/banner", {
          enabled: this.enabled,
          text: this.text.trim(),
          link: this.link.trim(),
          linkText: this.linkText.trim(),
          endsAt: end ? end.toISOString() : null,
        }),
      this.enabled ? "The banner is on." : "The banner is off.",
    );
  }

  render(): TemplateResult {
    const s = this.setting;
    const problem = this.problem();
    const live =
      s?.enabled && s.text && (!s.endsAt || Date.parse(s.endsAt) > Date.now());
    return html`<div class="adm-head">
        <div>
          <h1>Site banner</h1>
          <p class="adm-sub">
            One line under the top bar on every page that has it: Derp Land,
            DerpyFront's menu, Derpy Conquest and Mr. Based.
          </p>
        </div>
      </div>
      ${this.error ? this.failed() : nothing}
      ${s === null
        ? html`<p class="adm-quiet">Loading…</p>`
        : html`<div class="adm-split">
            <div class="adm-box">
              <h2>
                The banner
                <span class="adm-aside"
                  >${live
                    ? pill("Showing", "good")
                    : s.enabled
                      ? pill("Ended", "warn")
                      : pill("Off")}
                  ${s.updatedAt
                    ? html`changed ${ago(s.updatedAt)}`
                    : nothing}</span
                >
              </h2>
              <form
                class="adm-form"
                @submit=${(e: SubmitEvent) => {
                  e.preventDefault();
                  if (!problem) void this.save();
                }}
              >
                <label class="adm-check">
                  <input
                    type="checkbox"
                    .checked=${this.enabled}
                    @change=${(e: Event) =>
                      (this.enabled = (e.target as HTMLInputElement).checked)}
                  />
                  Show it
                </label>
                <label
                  >Text (${this.text.length} of ${BANNER_TEXT_MAX})
                  <textarea
                    class="adm-textarea"
                    maxlength=${BANNER_TEXT_MAX}
                    .value=${this.text}
                    @input=${(e: InputEvent) =>
                      (this.text = (e.target as HTMLTextAreaElement).value)}
                  ></textarea>
                </label>
                <div class="adm-inline">
                  <label
                    >Link (optional)
                    <input
                      class="adm-input"
                      placeholder="/store or https://…"
                      .value=${this.link}
                      @input=${(e: InputEvent) =>
                        (this.link = (e.target as HTMLInputElement).value)}
                  /></label>
                  <label
                    >Link's words
                    <input
                      class="adm-input"
                      placeholder="Take a look"
                      maxlength=${BANNER_LINK_TEXT_MAX}
                      ?disabled=${!this.link.trim()}
                      .value=${this.linkText}
                      @input=${(e: InputEvent) =>
                        (this.linkText = (e.target as HTMLInputElement).value)}
                  /></label>
                </div>
                <label
                  >Ends (optional, your time)
                  <input
                    class="adm-input"
                    type="datetime-local"
                    .value=${this.endsAt}
                    @input=${(e: InputEvent) =>
                      (this.endsAt = (e.target as HTMLInputElement).value)}
                /></label>
                ${problem ? html`<p class="adm-err">${problem}</p>` : nothing}
                <div class="adm-row">
                  <button class="dl-btn" ?disabled=${!!problem || this.busy}>
                    Save
                  </button>
                  ${this.endsAt
                    ? html`<button
                        type="button"
                        class="dl-btn ghost small"
                        @click=${() => (this.endsAt = "")}
                      >
                        No end time
                      </button>`
                    : nothing}
                </div>
              </form>
            </div>
            <div class="adm-box">
              <h2>How it looks</h2>
              ${this.text.trim()
                ? html`<div class="adm-banner-preview">
                    ${preview(
                      this.text.trim(),
                      this.link.trim(),
                      this.linkText.trim(),
                    )}
                  </div>`
                : html`<p class="adm-quiet">Write something to see it.</p>`}
              <p class="adm-small" style="margin-top:10px">
                It rides on what pages already ask for (the 15-second check-in,
                or What's New's list when signed out), so it costs nothing
                extra. Closing it is remembered in that browser.
              </p>
            </div>
          </div>`}`;
  }
}

function preview(text: string, link: string, linkText: string): TemplateResult {
  return html`<div
    style="display:flex;align-items:center;gap:10px;padding:7px 8px 7px 14px;background:color-mix(in srgb, #f5cc3c 14%, #16161a);font-size:14px;font-weight:560"
  >
    <span style="flex:1;min-width:0;overflow-wrap:anywhere"
      >${text}${link
        ? html`<span
            style="margin-left:8px;font-weight:700;text-decoration:underline;text-decoration-color:#f5cc3c;text-underline-offset:3px"
            >${linkText || "Take a look"}</span
          >`
        : nothing}</span
    >
    <span style="color:var(--text-2)">${closeIcon("dl-i")}</span>
  </div>`;
}

registerSection({
  id: "banner",
  label: "Site banner",
  order: 80,
  icon: () => flagBannerIcon(),
  render: (view) => html`<adm-banner .view=${view}></adm-banner>`,
});
