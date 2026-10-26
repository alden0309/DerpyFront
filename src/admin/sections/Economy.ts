// ADMIN (r26): Economy: the coin ledger (filter by kind and account, page
// back in time), totals per day for the last 30 days, and the store's
// catalog with prices and owners (prices live in code: ask Claude).

import { html, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { coinsIcon } from "../icons";
import { AdminPage } from "../Page";
import { registerSection } from "../Registry";
import { accountLink, ago, delta, nf, pill, table, when } from "../ui";

interface LedgerRow {
  at: string;
  accountId: number;
  username: string;
  kind: string;
  delta: number;
  what: string;
  ref: string | null;
}

interface Day {
  day: string;
  earned: number;
  spent: number;
  admin: number;
  purchases: number;
}

interface CatalogItem {
  name: string;
  label: string;
  game: string;
  category: string;
  price: number;
  owners: number;
  given: number;
}

type Tab = "ledger" | "days" | "catalog";

@customElement("adm-economy")
export class AdminEconomy extends AdminPage {
  @state() private rows: LedgerRow[] | null = null;
  @state() private kinds: Record<string, string> = {};
  @state() private days: { days: Day[]; inAccounts: number } | null = null;
  @state() private catalog: {
    items: CatalogItem[];
    tabs: {
      game: string;
      label: string;
      categories: { id: string; label: string }[];
    }[];
  } | null = null;
  @state() private older: LedgerRow[] = [];
  @state() private more = false;

  private get tab(): Tab {
    const t = this.view.path[0];
    return t === "days" || t === "catalog" ? t : "ledger";
  }

  protected async fetch(): Promise<void> {
    const q = this.view.query;
    if (this.tab === "ledger") {
      const params = new URLSearchParams();
      if (q.get("kind")) params.set("kind", q.get("kind")!);
      if (q.get("account")) params.set("account", q.get("account")!);
      const r = await this.view.get<{
        rows: LedgerRow[];
        kinds: Record<string, string>;
      }>(`/economy/ledger?${params}`);
      this.rows = r.rows;
      this.kinds = r.kinds;
      this.older = [];
      this.more = r.rows.length === 100;
    } else if (this.tab === "days") {
      this.days = await this.view.get("/economy/days");
    } else {
      this.catalog = await this.view.get("/economy/catalog");
    }
  }

  private async loadOlder(): Promise<void> {
    const all = [...(this.rows ?? []), ...this.older];
    const last = all[all.length - 1];
    if (!last) return;
    const q = this.view.query;
    const params = new URLSearchParams({ before: last.at });
    if (q.get("kind")) params.set("kind", q.get("kind")!);
    if (q.get("account")) params.set("account", q.get("account")!);
    const r = await this.view.get<{ rows: LedgerRow[] }>(
      `/economy/ledger?${params}`,
    );
    this.older = [...this.older, ...r.rows];
    this.more = r.rows.length === 100;
  }

  render(): TemplateResult {
    const tab = this.tab;
    const tabs: [Tab, string][] = [
      ["ledger", "Coin ledger"],
      ["days", "Per day"],
      ["catalog", "Store catalog"],
    ];
    return html`<div class="adm-head">
        <div>
          <h1>Economy</h1>
          <p class="adm-sub">Where Derp Coins come from and go.</p>
        </div>
      </div>
      <div class="dl-seg adm-tabs" role="tablist">
        ${tabs.map(
          ([id, label]) =>
            html`<button
              role="tab"
              aria-selected=${id === tab}
              @click=${() =>
                this.view.go(
                  `/admin/economy${id === "ledger" ? "" : `/${id}`}`,
                )}
            >
              ${label}
            </button>`,
        )}
      </div>
      ${this.error ? this.failed() : nothing}
      ${tab === "ledger"
        ? this.ledger()
        : tab === "days"
          ? this.perDay()
          : this.store()}`;
  }

  private ledger(): TemplateResult {
    const q = this.view.query;
    const apply = (form: HTMLFormElement) => {
      const f = new FormData(form);
      const next = new URLSearchParams();
      const kind = String(f.get("kind") ?? "");
      const account = String(f.get("account") ?? "").trim();
      if (kind) next.set("kind", kind);
      if (account) next.set("account", account);
      this.view.go(`/admin/economy${next.size ? `?${next}` : ""}`, {
        replace: true,
      });
    };
    const rows = [...(this.rows ?? []), ...this.older];
    return html`<form
        class="adm-search"
        @submit=${(e: SubmitEvent) => {
          e.preventDefault();
          apply(e.target as HTMLFormElement);
        }}
      >
        <select class="adm-select" name="kind" aria-label="Kind">
          <option value="">Every kind</option>
          ${Object.entries(this.kinds).map(
            ([k, label]) =>
              html`<option value=${k} ?selected=${q.get("kind") === k}>
                ${label}
              </option>`,
          )}
        </select>
        <input
          class="adm-input grow"
          name="account"
          placeholder="One account: name or #id"
          .value=${q.get("account") ?? ""}
          autocomplete="off"
        />
        <button class="dl-btn small">Show</button>
      </form>
      <p class="adm-small" style="margin:-6px 0 10px">
        Put together from the games, challenges, achievements, purchases and
        coins given by hand. Purchases made before this page show today's price.
      </p>
      <div class="adm-box">
        ${this.rows === null
          ? html`<p class="adm-quiet">Loading…</p>`
          : table(
              [
                {
                  label: "When",
                  cls: "nowrap",
                  cell: (r) =>
                    html`<span title=${when(r.at)}>${ago(r.at)}</span>`,
                },
                {
                  label: "Account",
                  cell: (r) => accountLink(r.accountId, r.username),
                },
                {
                  label: "What",
                  lead: true,
                  cell: (r) =>
                    html`${r.what} ${pill(this.kinds[r.kind] ?? r.kind)}`,
                },
                { label: "Coins", num: true, cell: (r) => delta(r.delta) },
              ],
              rows,
              "Nothing matches.",
            )}
        ${this.more
          ? html`<div class="adm-pager">
              <button
                class="dl-btn small ghost"
                @click=${() => void this.loadOlder()}
              >
                Older
              </button>
            </div>`
          : nothing}
      </div>`;
  }

  private perDay(): TemplateResult {
    const d = this.days;
    if (!d) return html`<p class="adm-quiet">Loading…</p>`;
    const top = Math.max(1, ...d.days.map((x) => Math.max(x.earned, x.spent)));
    const days = [...d.days].reverse();
    const sum = (k: "earned" | "spent" | "admin" | "purchases") =>
      d.days.reduce((n, x) => n + x[k], 0);
    return html`<div class="adm-grid">
      <div class="adm-stats">
        <div class="adm-stat">
          <span class="k">Paid out, 30 days</span
          ><span class="v">${nf(sum("earned"))}</span>
        </div>
        <div class="adm-stat">
          <span class="k">Spent in the store</span
          ><span class="v"
            >${nf(sum("spent"))}<small
              >${nf(sum("purchases"))} buys</small
            ></span
          >
        </div>
        <div class="adm-stat">
          <span class="k">By hand</span
          ><span class="v"
            >${sum("admin") >= 0 ? "+" : "−"}${nf(Math.abs(sum("admin")))}</span
          >
        </div>
        <div class="adm-stat">
          <span class="k">Held by every account now</span
          ><span class="v">${nf(d.inAccounts)}</span>
        </div>
      </div>
      <div class="adm-box">
        <h2>The last 30 days <span class="adm-aside">UTC days</span></h2>
        <div
          class="adm-chart"
          role="img"
          aria-label="Coins paid out and spent per day"
        >
          ${days.map(
            (x) =>
              html`<div
                class="col"
                title="${x.day}: +${nf(x.earned)} paid out, ${nf(
                  x.spent,
                )} spent"
              >
                <span
                  class="earned"
                  style="height:${(x.earned / top) * 100}%"
                ></span>
                <span
                  class="spent"
                  style="height:${(x.spent / top) * 100}%"
                ></span>
              </div>`,
          )}
        </div>
        <div class="adm-legend">
          <span
            ><i class="earned" style="background:var(--leaf)"></i>Paid out</span
          ><span><i style="background:var(--front)"></i>Spent</span>
        </div>
      </div>
      <div class="adm-box">
        ${table(
          [
            { label: "Day", lead: true, cell: (x) => x.day },
            { label: "Paid out", num: true, cell: (x) => nf(x.earned) },
            { label: "Spent", num: true, cell: (x) => nf(x.spent) },
            { label: "Buys", num: true, cell: (x) => nf(x.purchases) },
            {
              label: "By hand",
              num: true,
              cell: (x) => (x.admin ? delta(x.admin) : "0"),
            },
          ],
          d.days,
        )}
      </div>
    </div>`;
  }

  private store(): TemplateResult {
    const c = this.catalog;
    if (!c) return html`<p class="adm-quiet">Loading…</p>`;
    return html`<div class="adm-warnline" style="margin-bottom:14px">
        Prices live in the code (DerpyCatalog.ts), so this is read-only: ask
        Claude to change prices.
      </div>
      <div class="adm-grid">
        ${c.tabs.map(
          (t) =>
            html`<div class="adm-box">
              <h2>${t.label}</h2>
              ${table(
                [
                  { label: "Item", lead: true, cell: (i) => i.label },
                  {
                    label: "Kind",
                    cell: (i) =>
                      t.categories.find((x) => x.id === i.category)?.label ??
                      i.category,
                  },
                  { label: "Price", num: true, cell: (i) => nf(i.price) },
                  {
                    label: "Owners",
                    num: true,
                    cell: (i) =>
                      html`${nf(i.owners)}${i.given
                        ? html` <span class="adm-small"
                            >(${i.given} given)</span
                          >`
                        : nothing}`,
                  },
                ],
                c.items.filter((i) => i.game === t.game),
              )}
            </div>`,
        )}
      </div>`;
  }
}

registerSection({
  id: "economy",
  label: "Economy",
  order: 50,
  icon: () => coinsIcon(),
  render: (view) => html`<adm-economy .view=${view}></adm-economy>`,
});
