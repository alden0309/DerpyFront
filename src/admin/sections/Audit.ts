// ADMIN (r26): the audit log: every admin action, newest first, filterable
// (words, an action or a whole area, one target) and paged.

import { html, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { listIcon } from "../icons";
import { AdminPage } from "../Page";
import { registerSection } from "../Registry";
import { ago, nf, pill, table, when } from "../ui";

interface AuditRow {
  id: number;
  at: string;
  actor: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
}

interface AuditData {
  rows: AuditRow[];
  total: number;
  page: number;
  pages: number;
  actions: string[];
}

const show = (x: unknown) =>
  typeof x === "object" && x !== null ? JSON.stringify(x) : String(x);

function brief(v: unknown, only?: Set<string>): string {
  if (v === null || v === undefined) return "";
  if (typeof v !== "object") return String(v);
  return Object.entries(v as Record<string, unknown>)
    .filter(([k]) => !only || only.has(k))
    .map(([k, x]) => `${k}: ${show(x)}`)
    .join(", ");
}

/**
 * Of a before and an after with the same fields, only the fields that
 * changed (a banner's whole setting says only its text changed).
 */
export function changedKeys(
  before: unknown,
  after: unknown,
): Set<string> | undefined {
  if (
    typeof before !== "object" ||
    typeof after !== "object" ||
    before === null ||
    after === null
  )
    return undefined;
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changed = [...keys].filter((k) => show(a[k]) !== show(b[k]));
  return changed.length > 0 && changed.length < keys.size
    ? new Set(changed)
    : undefined;
}

function target(r: AuditRow): TemplateResult | string {
  if (!r.targetType) return "";
  const name = r.targetName ?? r.targetId ?? "";
  if (r.targetType === "account" && r.targetId)
    return html`<a href="/admin/accounts/${r.targetId}">${name}</a>`;
  return html`${name} <span class="adm-small">${r.targetType}</span>`;
}

@customElement("adm-audit")
export class AdminAudit extends AdminPage {
  @state() private data: AuditData | null = null;

  protected async fetch(): Promise<void> {
    const q = this.view.query;
    const params = new URLSearchParams();
    for (const k of ["q", "action", "targetType", "targetId", "page"]) {
      const v = q.get(k);
      if (v) params.set(k, v);
    }
    this.data = await this.view.get<AuditData>(`/audit?${params}`);
  }

  private with(changes: Record<string, string | null>): string {
    const next = new URLSearchParams(this.view.query);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    return `/admin/audit${next.size ? `?${next}` : ""}`;
  }

  private change(r: AuditRow): TemplateResult {
    const only = changedKeys(r.before, r.after);
    const was = r.before !== null ? brief(r.before, only) : "";
    const now = r.after !== null ? brief(r.after, only) : "";
    return html`<p class="adm-json">
      ${was ? html`<b>was</b> ${was}` : nothing}${was && now
        ? html`<br />`
        : nothing}${now ? html`<b>now</b> ${now}` : nothing}
    </p>`;
  }

  render(): TemplateResult {
    const d = this.data;
    const q = this.view.query;
    const areas = [...new Set((d?.actions ?? []).map((a) => a.split(".")[0]))];
    return html`<div class="adm-head">
        <div>
          <h1>Audit log</h1>
          <p class="adm-sub">
            Every admin action: who, what, to what, before and after, and when.
          </p>
        </div>
      </div>
      <form
        class="adm-search"
        @submit=${(e: SubmitEvent) => {
          e.preventDefault();
          const f = new FormData(e.target as HTMLFormElement);
          this.view.go(
            this.with({
              q: String(f.get("q") ?? "").trim() || null,
              action: String(f.get("action") ?? "") || null,
              page: null,
            }),
            { replace: true },
          );
        }}
      >
        <input
          class="adm-input grow"
          type="search"
          name="q"
          placeholder="A name, a reason, an action…"
          .value=${q.get("q") ?? ""}
          autocomplete="off"
        />
        <select class="adm-select" name="action" aria-label="Action">
          <option value="">Every action</option>
          ${areas.map(
            (area) =>
              html`<optgroup label=${area}>
                <option value=${area} ?selected=${q.get("action") === area}>
                  All of ${area}
                </option>
                ${(d?.actions ?? [])
                  .filter((a) => a.startsWith(`${area}.`))
                  .map(
                    (a) =>
                      html`<option
                        value=${a}
                        ?selected=${q.get("action") === a}
                      >
                        ${a}
                      </option>`,
                  )}
              </optgroup>`,
          )}
        </select>
        <button class="dl-btn small">Show</button>
        ${q.get("targetId")
          ? html`<a
              class="dl-btn small ghost"
              href=${this.with({
                targetType: null,
                targetId: null,
                page: null,
              })}
              >Every target</a
            >`
          : nothing}
      </form>
      ${this.error ? this.failed() : nothing}
      ${d
        ? html`<div class="adm-box">
            ${table(
              [
                {
                  label: "When",
                  cls: "nowrap",
                  cell: (r) =>
                    html`<span title=${when(r.at)}>${ago(r.at)}</span>`,
                },
                {
                  label: "Action",
                  lead: true,
                  cell: (r) =>
                    html`${pill(
                      r.action,
                      r.action.includes("delete") ||
                        r.action.includes("suspend")
                        ? "bad"
                        : "",
                    )}`,
                },
                { label: "Target", cell: (r) => target(r) },
                { label: "Reason", cell: (r) => r.reason ?? "" },
                {
                  label: "Change",
                  cell: (r) =>
                    r.before === null && r.after === null ? "" : this.change(r),
                },
                { label: "By", cell: (r) => r.actor },
              ],
              d.rows,
              "Nothing in the log matches.",
            )}
            <div class="adm-pager">
              ${d.page > 1
                ? html`<a
                    class="dl-btn small ghost"
                    href=${this.with({ page: String(d.page - 1) })}
                    >‹ Newer</a
                  >`
                : nothing}
              <span>Page ${d.page} of ${d.pages} · ${nf(d.total)} lines</span>
              ${d.page < d.pages
                ? html`<a
                    class="dl-btn small ghost"
                    href=${this.with({ page: String(d.page + 1) })}
                    >Older ›</a
                  >`
                : nothing}
            </div>
          </div>`
        : html`<p class="adm-quiet">Loading…</p>`}`;
  }
}

registerSection({
  id: "audit",
  label: "Audit log",
  order: 90,
  icon: () => listIcon(),
  render: (view) => html`<adm-audit .view=${view}></adm-audit>`,
});
