// ADMIN (r26): Accounts. The list (search by name or id, filters, sorts),
// and an account's page: who they are, what they have, what they've
// played, their sessions, what other sections add (account panels), the
// audit lines about them, and every action, each confirmed (typing their
// name for anything that can't be undone easily).

import { html, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { coinIcon } from "../../derpland/Icons";
import { userIcon } from "../icons";
import { AdminPage } from "../Page";
import { accountPanels, registerSection } from "../Registry";
import {
  accountLink,
  ago,
  delta,
  errorText,
  nf,
  pill,
  span,
  table,
  when,
} from "../ui";

/** Coin changes over this need the name typed and a recent sign-in (the server's COIN_CONFIRM_OVER). */
const COIN_CONFIRM_OVER = 1000;

interface ListRow {
  id: number;
  username: string;
  oldName: string | null;
  coins: number;
  createdAt: string;
  lastSeen: string | null;
  games: number;
  owner: boolean;
  basedAccess: boolean;
  suspended: boolean;
  suspendedUntil: string | null;
  online: boolean;
}

interface LedgerRow {
  at: string;
  kind: string;
  delta: number;
  what: string;
  ref: string | null;
}

interface AccountData {
  account: {
    id: number;
    username: string;
    coins: number;
    createdAt: string;
    oldName: string | null;
    usernameChangedAt: string | null;
    owner: boolean;
    marks: { based_access: boolean; appear_offline: boolean };
    basedGrantedAs: string | null;
    suspension: {
      at: string;
      until: string | null;
      reason: string | null;
      now: boolean;
    } | null;
    newsSeen: string | null;
  };
  online: { place: string; hidden: boolean } | null;
  basedLastActive: string | null;
  items: {
    item: string;
    label: string | null;
    game: string | null;
    category: string | null;
    acquiredAt: string;
    granted: boolean;
    price: number | null;
    priceKnown: boolean;
  }[];
  store: { name: string; label: string; game: string; category: string; price: number }[];
  games: {
    derpyfront: {
      gameId: string;
      map: string;
      mode: string;
      scenario: string | null;
      endedAt: string;
      durationS: number;
      players: number;
      won: boolean;
      coins: number;
    }[];
    conquest: {
      gameId: string;
      endedAt: string;
      year: number;
      players: number;
      nation: string;
      won: boolean;
      coins: number;
    }[];
    frontCount: number;
    conquestCount: number;
  };
  social: {
    friends: number;
    requestsIn: number;
    requestsOut: number;
    party: { leader: boolean; size: number } | null;
  };
  sessions: { tag: string; createdAt: string; lastSeen: string; current: boolean }[];
  resets: { createdAt: string; expiresAt: string; usedAt: string | null }[];
  history: LedgerRow[];
  audit: {
    id: number;
    at: string;
    actor: string;
    action: string;
    reason: string | null;
    before: unknown;
    after: unknown;
  }[];
  panels: Record<string, unknown>;
}

const KIND_NAMES: Record<string, string> = {
  game: "DerpyFront",
  conquest: "Conquest",
  table: "Conquest table",
  achievement: "Achievement",
  challenge: "Challenge",
  purchase: "Purchase",
  admin: "By hand",
};

// ---------------------------------------------------------------- the list

@customElement("adm-accounts")
export class AdminAccounts extends AdminPage {
  @state() private rows: ListRow[] | null = null;
  @state() private total = 0;

  protected async fetch(): Promise<void> {
    if (this.view.path[0]) return;
    const q = this.view.query;
    const params = new URLSearchParams();
    for (const k of ["q", "filter", "sort"]) {
      const v = q.get(k);
      if (v) params.set(k, v);
    }
    const r = await this.view.get<{ total: number; accounts: ListRow[] }>(
      `/accounts?${params}`,
    );
    this.rows = r.accounts;
    this.total = r.total;
  }

  render(): TemplateResult {
    const id = Number(this.view.path[0]);
    if (this.view.path[0])
      return Number.isSafeInteger(id) && id > 0
        ? html`<adm-account .view=${this.view} .accountId=${id}></adm-account>`
        : html`<p class="adm-quiet">No such account.</p>`;
    const q = this.view.query;
    const filter = q.get("filter") ?? "";
    const sort = q.get("sort") ?? "new";
    const set = (k: string, v: string) => {
      const next = new URLSearchParams(q);
      if (v) next.set(k, v);
      else next.delete(k);
      this.view.go(`/admin/accounts${next.size ? `?${next}` : ""}`, {
        replace: true,
      });
    };
    return html`<div class="adm-head">
        <div>
          <h1>Accounts</h1>
          <p class="adm-sub">${nf(this.total)} accounts. Search by name (also a name given up lately) or by id.</p>
        </div>
      </div>
      <form
        class="adm-search"
        @submit=${(e: SubmitEvent) => {
          e.preventDefault();
          set("q", String(new FormData(e.target as HTMLFormElement).get("q") ?? "").trim());
        }}
      >
        <input
          class="adm-input grow"
          name="q"
          type="search"
          placeholder="Name or #id"
          .value=${q.get("q") ?? ""}
          autocomplete="off"
        />
        <button class="dl-btn small">Search</button>
        <select
          class="adm-select"
          aria-label="Show"
          @change=${(e: Event) => set("filter", (e.target as HTMLSelectElement).value)}
        >
          ${[
            ["", "Everyone"],
            ["suspended", "Suspended"],
            ["based", "Plays Mr. Based"],
          ].map(([v, l]) => html`<option value=${v} ?selected=${filter === v}>${l}</option>`)}
        </select>
        <select
          class="adm-select"
          aria-label="Order"
          @change=${(e: Event) => set("sort", (e.target as HTMLSelectElement).value)}
        >
          ${[
            ["new", "Newest first"],
            ["seen", "Last seen"],
            ["coins", "Most coins"],
            ["name", "By name"],
          ].map(([v, l]) => html`<option value=${v} ?selected=${sort === v}>${l}</option>`)}
        </select>
      </form>
      ${this.error ? this.failed() : nothing}
      ${this.rows === null
        ? html`<p class="adm-quiet">Loading…</p>`
        : html`<div class="adm-box">
            ${table(
              [
                {
                  label: "Name",
                  lead: true,
                  cell: (a) =>
                    html`${accountLink(a.id, a.username)}
                      <span class="adm-small">#${a.id}</span>
                      ${a.oldName && a.oldName !== a.username
                        ? html`<span class="adm-small">was ${a.oldName}</span>`
                        : nothing}`,
                },
                { label: "", cell: (a) => flags(a) },
                { label: "Coins", num: true, cell: (a) => nf(a.coins) },
                { label: "Games", num: true, cell: (a) => nf(a.games) },
                { label: "Joined", cls: "nowrap", cell: (a) => html`<span title=${when(a.createdAt)}>${ago(a.createdAt)}</span>` },
                { label: "Last seen", cls: "nowrap", cell: (a) => (a.lastSeen ? html`<span title=${when(a.lastSeen)}>${ago(a.lastSeen)}</span>` : "never signed in") },
              ],
              this.rows,
              "No account matches.",
            )}
            ${this.rows.length === 100
              ? html`<p class="adm-small" style="margin-top:8px">Showing the first 100. Search to narrow it down.</p>`
              : nothing}
          </div>`}`;
  }
}

function flags(a: {
  owner: boolean;
  basedAccess: boolean;
  suspended: boolean;
  online: boolean;
}): TemplateResult {
  return html`${a.owner ? pill("You", "warn") : nothing}
  ${a.online ? pill("Online", "good") : nothing}
  ${a.suspended ? pill("Suspended", "bad") : nothing}
  ${a.basedAccess && !a.owner ? pill("Mr. Based", "violet") : nothing}`;
}

// ---------------------------------------------------------------- one account

@customElement("adm-account")
export class AdminAccount extends AdminPage {
  accountId = 0;
  @state() private data: AccountData | null = null;
  @state() private coinAmount = "";
  @state() private coinReason = "";
  @state() private newName = "";
  @state() private grantItem = "";
  @state() private suspendReason = "";
  @state() private suspendUntil = "";
  @state() private link: { url: string; expiresAt: string } | null = null;

  protected loadKey(): string {
    return `${this.view.path.join("/")}`;
  }

  protected async fetch(): Promise<void> {
    this.data = await this.view.get<AccountData>(`/accounts/${this.accountId}`);
  }

  private get a() {
    return this.data!.account;
  }

  private path(p: string): string {
    return `/accounts/${this.accountId}${p}`;
  }

  render(): TemplateResult {
    if (this.error && !this.data)
      return html`<p class="adm-crumb"><a href="/admin/accounts">Accounts</a></p>
        ${this.failed()}`;
    const d = this.data;
    if (!d) return html`<p class="adm-quiet">Loading…</p>`;
    const a = d.account;
    return html`<p class="adm-crumb"><a href="/admin/accounts">Accounts</a> / #${a.id}</p>
      <div class="adm-head">
        <div>
          <h1>${a.username}</h1>
          <p class="adm-sub">
            ${flags({
              owner: a.owner,
              basedAccess: a.marks.based_access,
              suspended: a.suspension?.now ?? false,
              online: d.online !== null,
            })}
            Joined ${when(a.createdAt)}.
            <a class="adm-link" href="/player/${encodeURIComponent(a.username)}" target="_blank">Their page</a>
          </p>
        </div>
        <button class="dl-btn ghost small" @click=${() => void this.reload()}>Refresh</button>
      </div>
      ${this.error ? this.failed() : nothing}
      ${a.suspension?.now
        ? html`<div class="adm-badline" style="margin-bottom:14px">
            Suspended ${when(a.suspension.at)}${a.suspension.until
              ? html`, until ${when(a.suspension.until)}`
              : ", until lifted"}.
            ${a.suspension.reason ? html`Reason: ${a.suspension.reason}` : nothing}
          </div>`
        : nothing}
      <div class="adm-grid">
        <div class="adm-cols">
          ${this.profileBox(d)} ${this.coinsBox(d)}
        </div>
        ${this.actionsBox(d)}
        <div class="adm-cols">
          ${this.historyBox(d)} ${this.itemsBox(d)}
        </div>
        <div class="adm-cols">
          ${this.gamesBox(d)} ${this.sessionsBox(d)}
        </div>
        ${this.panelsBox(d)} ${this.auditBox(d)}
      </div>`;
  }

  private profileBox(d: AccountData): TemplateResult {
    const a = d.account;
    return html`<div class="adm-box">
      <h2>Profile</h2>
      <dl class="adm-facts">
        <dt>Account id</dt>
        <dd class="adm-mono">${a.id}</dd>
        <dt>Coins</dt>
        <dd>${nf(a.coins)}</dd>
        <dt>Name</dt>
        <dd>
          ${a.username}${a.oldName && a.oldName !== a.username
            ? html` <span class="adm-small">(was ${a.oldName}, changed ${ago(a.usernameChangedAt)})</span>`
            : a.usernameChangedAt
              ? html` <span class="adm-small">(changed ${ago(a.usernameChangedAt)})</span>`
              : nothing}
        </dd>
        <dt>Now</dt>
        <dd>
          ${d.online ? html`${d.online.place}${d.online.hidden ? html` ${pill("Appears offline")}` : nothing}` : "Not on the site"}
        </dd>
        <dt>Mr. Based</dt>
        <dd>
          ${a.marks.based_access
            ? html`Plays it${a.basedGrantedAs ? html` <span class="adm-small">(marked as ${a.basedGrantedAs})</span>` : nothing}${d.basedLastActive ? html`, last ${ago(d.basedLastActive)}` : nothing}`
            : "No"}
        </dd>
        <dt>Friends</dt>
        <dd>
          ${nf(d.social.friends)}${d.social.requestsIn || d.social.requestsOut
            ? html` <span class="adm-small">(${d.social.requestsIn} requests in, ${d.social.requestsOut} out)</span>`
            : nothing}
        </dd>
        <dt>Party</dt>
        <dd>${d.social.party ? `${d.social.party.leader ? "Leads" : "In"} a party of ${d.social.party.size}` : "None"}</dd>
        <dt>Games</dt>
        <dd>${nf(d.games.frontCount)} DerpyFront, ${nf(d.games.conquestCount)} Derpy Conquest</dd>
      </dl>
    </div>`;
  }

  private coinsBox(d: AccountData): TemplateResult {
    const n = Math.trunc(Number(this.coinAmount));
    const valid = Number.isFinite(n) && n > 0 && this.coinReason.trim().length > 0;
    const change = async (sign: 1 | -1) => {
      const amount = sign * n;
      const big = Math.abs(amount) > COIN_CONFIRM_OVER;
      const ok = await this.view.confirm({
        title: `${sign > 0 ? "Give" : "Take"} ${nf(n)} Derp Coins`,
        body: `${sign > 0 ? "To" : "From"} ${d.account.username} (${nf(d.account.coins)} now). Reason: ${this.coinReason.trim()}. It goes in their coin history.`,
        action: sign > 0 ? `Give ${nf(n)}` : `Take ${nf(n)}`,
        typed: big ? d.account.username : undefined,
        danger: sign < 0,
      });
      if (!ok) return;
      const r = await this.act(
        () =>
          this.view.post<{ coins: number }>(this.path("/coins"), {
            delta: amount,
            reason: this.coinReason.trim(),
            ...(big ? { confirm: d.account.username } : {}),
          }),
        sign > 0 ? "Coins given." : "Coins taken.",
      );
      if (r) {
        this.coinAmount = "";
        this.coinReason = "";
      }
    };
    return html`<div class="adm-box">
      <h2>${coinIcon("dl-coin sm")} Derp Coins <span class="adm-aside">${nf(d.account.coins)}</span></h2>
      <div class="adm-form">
        <div class="adm-inline">
          <label
            >Amount
            <input
              class="adm-input"
              type="number"
              min="1"
              max="1000000"
              inputmode="numeric"
              .value=${this.coinAmount}
              @input=${(e: InputEvent) => (this.coinAmount = (e.target as HTMLInputElement).value)}
          /></label>
          <label style="flex:3 1 200px"
            >Reason (in their coin history)
            <input
              class="adm-input"
              maxlength="300"
              .value=${this.coinReason}
              @input=${(e: InputEvent) => (this.coinReason = (e.target as HTMLInputElement).value)}
          /></label>
        </div>
        <div class="adm-row">
          <button class="dl-btn small" ?disabled=${!valid || this.busy} @click=${() => void change(1)}>Give</button>
          <button class="dl-btn small adm-danger ghost" ?disabled=${!valid || this.busy} @click=${() => void change(-1)}>Take</button>
          <span class="adm-small">Over ${nf(COIN_CONFIRM_OVER)}: type their name, and a sign-in from the last 12 hours.</span>
        </div>
      </div>
    </div>`;
  }

  private actionsBox(d: AccountData): TemplateResult {
    const a = d.account;
    const name = a.username;
    const susp = a.suspension?.now ?? false;
    const mark = async (m: "based_access" | "appear_offline", value: boolean) => {
      const label = m === "based_access" ? "Plays Mr. Based" : "Appears offline";
      const ok = await this.view.confirm({
        title: `${value ? "Set" : "Clear"} "${label}"`,
        body:
          m === "based_access"
            ? value
              ? `${name} will be able to play Mr. Based, and see its news. It never makes them an admin.`
              : `${name} won't be able to play Mr. Based any more. Their saves are kept.`
            : value
              ? `${name} won't show on anyone's list of who's online.`
              : `${name} shows on who's online again.`,
        action: value ? "Set it" : "Clear it",
        typed: m === "based_access" ? name : undefined,
      });
      if (!ok) return;
      await this.act(
        () => this.view.post(this.path("/marks"), { mark: m, value, confirm: name }),
        "Done.",
      );
    };
    return html`<div class="adm-box">
      <h2>Actions</h2>
      <div class="adm-actions">
        <div class="adm-action">
          <h3>Marks</h3>
          <label class="adm-check" style="display:flex;gap:8px;align-items:center">
            <input
              type="checkbox"
              .checked=${a.marks.based_access}
              ?disabled=${a.owner || this.busy}
              @change=${(e: Event) => {
                const el = e.target as HTMLInputElement;
                const v = el.checked;
                el.checked = !v;
                void mark("based_access", v);
              }}
            />
            Plays Mr. Based
          </label>
          <label class="adm-check" style="display:flex;gap:8px;align-items:center">
            <input
              type="checkbox"
              .checked=${a.marks.appear_offline}
              ?disabled=${this.busy}
              @change=${(e: Event) => {
                const el = e.target as HTMLInputElement;
                const v = el.checked;
                el.checked = !v;
                void mark("appear_offline", v);
              }}
            />
            Appears offline
          </label>
          ${a.owner ? html`<p>Your own Mr. Based mark is how this page knows you: it stays.</p>` : nothing}
        </div>

        <div class="adm-action">
          <h3>Rename</h3>
          <p>No 7-day wait. The name must be free and allowed; the old one is kept for them 7 days.</p>
          <div class="adm-row">
            <input
              class="adm-input"
              style="flex:1 1 120px"
              placeholder="New name"
              maxlength="20"
              autocomplete="off"
              .value=${this.newName}
              @input=${(e: InputEvent) => (this.newName = (e.target as HTMLInputElement).value)}
            />
            <button
              class="dl-btn small"
              ?disabled=${!/^[A-Za-z0-9_]{3,20}$/.test(this.newName.trim()) || this.busy}
              @click=${async () => {
                const to = this.newName.trim();
                const ok = await this.view.confirm({
                  title: `Rename ${name} to ${to}`,
                  body: "Everywhere their name shows changes at once.",
                  action: "Rename",
                  typed: name,
                  reason: true,
                });
                if (!ok) return;
                const r = await this.act(
                  () => this.view.post(this.path("/rename"), { username: to, confirm: name, reason: ok.reason }),
                  `Renamed to ${to}.`,
                );
                if (r) this.newName = "";
              }}
            >
              Rename
            </button>
          </div>
        </div>

        <div class="adm-action">
          <h3>Sign out everywhere</h3>
          <p>Ends every session they have (${d.sessions.length} now). They can sign in again.</p>
          <div>
            <button
              class="dl-btn small ghost"
              ?disabled=${d.sessions.length === 0 || this.busy}
              @click=${async () => {
                const ok = await this.view.confirm({
                  title: `Sign ${name} out everywhere`,
                  body: d.sessions.some((s) => s.current)
                    ? "That includes this browser: you'll be signed out here too."
                    : `Their ${d.sessions.length} sessions end now.`,
                  action: "Sign them out",
                  typed: name,
                });
                if (ok)
                  await this.act(
                    () => this.view.post(this.path("/signout"), { confirm: name }),
                    "Signed out everywhere.",
                  );
              }}
            >
              Sign out everywhere
            </button>
          </div>
        </div>

        <div class="adm-action">
          <h3>Password reset link</h3>
          <p>A one-time link for 24 hours, for you to send them yourself (there's no email). A new link ends the old one.</p>
          ${this.link
            ? html`<div class="adm-copy">
                  <input class="adm-input adm-mono" readonly .value=${this.link.url} @focus=${(e: Event) => (e.target as HTMLInputElement).select()} />
                  <button
                    class="dl-btn small"
                    @click=${() =>
                      void navigator.clipboard
                        ?.writeText(this.link!.url)
                        .then(() => this.view.toast("Copied.", "good"))
                        .catch(() => this.view.toast("Select it and copy it.", "bad"))}
                  >
                    Copy
                  </button>
                </div>
                <p class="adm-small">Works once, until ${when(this.link.expiresAt)}.</p>`
            : d.resets[0] && !d.resets[0].usedAt && Date.parse(d.resets[0].expiresAt) > Date.now()
              ? html`<p class="adm-small">A link made ${ago(d.resets[0].createdAt)} is still open (until ${when(d.resets[0].expiresAt)}).</p>`
              : nothing}
          <div>
            <button
              class="dl-btn small ghost"
              ?disabled=${a.owner || this.busy}
              @click=${async () => {
                const ok = await this.view.confirm({
                  title: `A password reset link for ${name}`,
                  body: "Whoever has the link can set the account's password, once, in the next 24 hours.",
                  action: "Make the link",
                  typed: name,
                });
                if (!ok) return;
                const r = await this.act(() =>
                  this.view.post<{ path: string; expiresAt: string }>(this.path("/reset-link"), { confirm: name }),
                );
                if (r) this.link = { url: `${location.origin}${r.path}`, expiresAt: r.expiresAt };
              }}
            >
              Make a link
            </button>
          </div>
        </div>

        <div class="adm-action danger">
          <h3>${susp ? "Suspended" : "Suspend"}</h3>
          ${a.owner
            ? html`<p>Your own account can't be suspended or deleted here.</p>`
            : susp
              ? html`<p>They can't sign in${a.suspension?.until ? html` until ${when(a.suspension.until)}` : nothing}.</p>
                  <div>
                    <button
                      class="dl-btn small"
                      ?disabled=${this.busy}
                      @click=${async () => {
                        const ok = await this.view.confirm({
                          title: `Lift ${name}'s suspension`,
                          body: "They can sign in again at once.",
                          action: "Lift it",
                          reason: true,
                        });
                        if (ok)
                          await this.act(
                            () => this.view.post(this.path("/unsuspend"), { reason: ok.reason }),
                            "Suspension lifted.",
                          );
                      }}
                    >
                      Lift the suspension
                    </button>
                  </div>`
              : html`<p>No sign-in (and every session ends) until it's lifted or the end date.</p>
                  <div class="adm-form">
                    <label
                      >Reason
                      <input
                        class="adm-input"
                        maxlength="300"
                        .value=${this.suspendReason}
                        @input=${(e: InputEvent) => (this.suspendReason = (e.target as HTMLInputElement).value)}
                    /></label>
                    <label
                      >Ends (optional)
                      <input
                        class="adm-input"
                        type="datetime-local"
                        .value=${this.suspendUntil}
                        @input=${(e: InputEvent) => (this.suspendUntil = (e.target as HTMLInputElement).value)}
                    /></label>
                    <div>
                      <button
                        class="dl-btn small adm-danger"
                        ?disabled=${!this.suspendReason.trim() || this.busy}
                        @click=${async () => {
                          const until = this.suspendUntil ? new Date(this.suspendUntil) : null;
                          if (until && Number.isNaN(until.getTime())) return;
                          const ok = await this.view.confirm({
                            title: `Suspend ${name}`,
                            body: `${until ? `Until ${when(until.getTime())}` : "Until you lift it"}. Reason: ${this.suspendReason.trim()}. They're signed out everywhere now.`,
                            action: "Suspend",
                            typed: name,
                            danger: true,
                          });
                          if (!ok) return;
                          const r = await this.act(
                            () =>
                              this.view.post(this.path("/suspend"), {
                                reason: this.suspendReason.trim(),
                                until: until ? until.toISOString() : null,
                                confirm: name,
                              }),
                            "Suspended.",
                          );
                          if (r) {
                            this.suspendReason = "";
                            this.suspendUntil = "";
                          }
                        }}
                      >
                        Suspend
                      </button>
                    </div>
                  </div>`}
        </div>

        <div class="adm-action danger">
          <h3>Delete the account</h3>
          ${a.owner
            ? html`<p>Your own account can't be deleted here.</p>`
            : html`<p>For good: their games' lines, items, coins, friends, saves and sessions go with it. The games themselves stay.</p>
                <div>
                  <button
                    class="dl-btn small adm-danger"
                    ?disabled=${this.busy}
                    @click=${async () => {
                      const ok = await this.view.confirm({
                        title: `Delete ${name}`,
                        body: "This can't be undone.",
                        action: "Delete for good",
                        typed: `delete ${name}`,
                        danger: true,
                        reason: true,
                      });
                      if (!ok) return;
                      try {
                        await this.view.post(this.path("/delete"), {
                          confirm: `delete ${name}`,
                          reason: ok.reason,
                        });
                        this.view.toast(`${name} is deleted.`, "good");
                        this.view.go("/admin/accounts");
                      } catch (err) {
                        this.view.toast(errorText((err as { code?: string }).code ?? "server_error"), "bad");
                      }
                    }}
                  >
                    Delete…
                  </button>
                </div>`}
        </div>
      </div>
    </div>`;
  }

  private historyBox(d: AccountData): TemplateResult {
    return html`<div class="adm-box">
      <h2>Coin history <span class="adm-aside"><a href="/admin/economy?account=${encodeURIComponent(d.account.username)}">All of it</a></span></h2>
      ${table(
        [
          { label: "When", cls: "nowrap", cell: (r) => html`<span title=${when(r.at)}>${ago(r.at)}</span>` },
          { label: "What", lead: true, cell: (r) => html`${r.what} ${pill(KIND_NAMES[r.kind] ?? r.kind)}` },
          { label: "Coins", num: true, cell: (r) => delta(r.delta) },
        ],
        d.history,
        "No coins in or out yet.",
      )}
    </div>`;
  }

  private itemsBox(d: AccountData): TemplateResult {
    const packs = d.items.filter((i) => i.item.startsWith("pack:"));
    const owned = new Set(packs.map((i) => i.item.slice(5)));
    const available = d.store.filter((s) => !owned.has(s.name));
    const name = d.account.username;
    return html`<div class="adm-box">
      <h2>Store items <span class="adm-aside">${packs.length} owned, ${d.items.length} rows</span></h2>
      <div class="adm-row" style="margin-bottom:10px">
        <select
          class="adm-select"
          style="flex:1 1 200px"
          aria-label="Item to give"
          @change=${(e: Event) => (this.grantItem = (e.target as HTMLSelectElement).value)}
        >
          <option value="" ?selected=${this.grantItem === ""}>Give an item…</option>
          ${["derpyfront", "conquest"].map(
            (g) => html`<optgroup label=${g === "derpyfront" ? "DerpyFront" : "Derpy Conquest"}>
              ${available
                .filter((s) => s.game === g)
                .map((s) => html`<option value=${s.name} ?selected=${this.grantItem === s.name}>${s.label} (${nf(s.price)})</option>`)}
            </optgroup>`,
          )}
        </select>
        <button
          class="dl-btn small"
          ?disabled=${!this.grantItem || this.busy}
          @click=${async () => {
            const item = d.store.find((s) => s.name === this.grantItem);
            if (!item) return;
            const ok = await this.view.confirm({
              title: `Give ${item.label}`,
              body: `To ${name}, free. It isn't a purchase.`,
              action: "Give it",
              reason: true,
            });
            if (!ok) return;
            const r = await this.act(
              () => this.view.post(this.path("/items/grant"), { item: item.name, ...(ok.reason ? { reason: ok.reason } : {}) }),
              `${item.label} given.`,
            );
            if (r) this.grantItem = "";
          }}
        >
          Give
        </button>
      </div>
      ${table(
        [
          { label: "Item", lead: true, cell: (i) => html`${i.label ?? i.item.slice(5)} <span class="adm-small">${i.game === "conquest" ? "Conquest" : i.game === "derpyfront" ? "DerpyFront" : ""}</span>` },
          { label: "How", cell: (i) => (i.granted ? pill("Given") : i.price === null ? pill("Bought") : html`Bought, ${nf(i.price)}${i.priceKnown ? "" : " (today's price)"}`) },
          { label: "When", cls: "nowrap", cell: (i) => html`<span title=${when(i.acquiredAt)}>${ago(i.acquiredAt)}</span>` },
          {
            label: "",
            cls: "acts",
            cell: (i) =>
              html`<button
                class="dl-btn small tiny ghost"
                ?disabled=${this.busy}
                @click=${async () => {
                  const label = i.label ?? i.item.slice(5);
                  const ok = await this.view.confirm({
                    title: `Take back ${label}`,
                    body: `${name} loses it${i.granted ? "" : " (no refund)"}.`,
                    action: "Take it back",
                    danger: true,
                    reason: true,
                  });
                  if (ok)
                    await this.act(
                      () => this.view.post(this.path("/items/revoke"), { item: i.item, ...(ok.reason ? { reason: ok.reason } : {}) }),
                      `${label} taken back.`,
                    );
                }}
              >
                Take back
              </button>`,
          },
        ],
        packs,
        "Nothing from the store.",
      )}
    </div>`;
  }

  private gamesBox(d: AccountData): TemplateResult {
    return html`<div class="adm-box">
      <h2>Recent games</h2>
      ${table(
        [
          { label: "Game", lead: true, cell: (g) => html`DerpyFront: ${g.scenario ?? g.map} ${g.won ? pill("Won", "good") : nothing}` },
          { label: "When", cls: "nowrap", cell: (g) => ago(g.endedAt) },
          { label: "Length", cls: "nowrap", cell: (g) => span(g.durationS) },
          { label: "Coins", num: true, cell: (g) => nf(g.coins) },
          { label: "", cls: "acts", cell: (g) => html`<a class="dl-btn small tiny ghost" href="/game/${encodeURIComponent(g.gameId)}" target="_blank">Replay</a>` },
        ],
        d.games.derpyfront,
        "No DerpyFront games saved.",
      )}
      <div style="height:10px"></div>
      ${table(
        [
          { label: "Game", lead: true, cell: (g) => html`Conquest to ${g.year} ${g.won ? pill("Won", "good") : nothing}` },
          { label: "When", cls: "nowrap", cell: (g) => ago(g.endedAt) },
          { label: "Players", num: true, cell: (g) => nf(g.players) },
          { label: "Coins", num: true, cell: (g) => nf(g.coins) },
          { label: "", cls: "acts", cell: (g) => html`<a class="dl-btn small tiny ghost" href="/chronicle/${encodeURIComponent(g.gameId)}" target="_blank">Story</a>` },
        ],
        d.games.conquest,
        "No Derpy Conquest games finished.",
      )}
    </div>`;
  }

  private sessionsBox(d: AccountData): TemplateResult {
    return html`<div class="adm-box">
      <h2>Sessions <span class="adm-aside">${d.sessions.length}</span></h2>
      ${table(
        [
          { label: "Session", lead: true, cell: (s) => html`<span class="adm-mono">${s.tag}…</span> ${s.current ? pill("This browser", "blue") : nothing}` },
          { label: "Signed in", cls: "nowrap", cell: (s) => html`<span title=${when(s.createdAt)}>${ago(s.createdAt)}</span>` },
          { label: "Last used", cls: "nowrap", cell: (s) => html`<span title=${when(s.lastSeen)}>${ago(s.lastSeen)}</span>` },
        ],
        d.sessions,
        "Not signed in anywhere.",
      )}
      ${d.resets.length
        ? html`<h2 class="adm-h2" style="margin-top:12px">Reset links</h2>
            ${table(
              [
                { label: "Made", lead: true, cell: (r) => when(r.createdAt) },
                { label: "State", cell: (r) => (r.usedAt ? `Used ${ago(r.usedAt)}` : Date.parse(r.expiresAt) > Date.now() ? `Open until ${when(r.expiresAt)}` : "Expired") },
              ],
              d.resets,
            )}`
        : nothing}
    </div>`;
  }

  private panelsBox(d: AccountData): TemplateResult | typeof nothing {
    const panels = accountPanels();
    if (panels.length === 0) return nothing;
    const ref = { id: d.account.id, username: d.account.username, owner: d.account.owner };
    return html`<div class="adm-cols">
      ${panels.map(
        (p) => html`<div class="adm-box">
          <h2>${p.label}</h2>
          ${p.render(ref, d.panels[p.id], this.view, () => void this.reload())}
        </div>`,
      )}
    </div>`;
  }

  private auditBox(d: AccountData): TemplateResult {
    return html`<div class="adm-box">
      <h2>
        What you've done here
        <span class="adm-aside"><a href="/admin/audit?targetType=account&targetId=${d.account.id}">The whole log</a></span>
      </h2>
      ${table(
        [
          { label: "When", cls: "nowrap", cell: (r) => html`<span title=${when(r.at)}>${ago(r.at)}</span>` },
          { label: "Action", lead: true, cell: (r) => pill(r.action) },
          { label: "Reason", cell: (r) => r.reason ?? "" },
        ],
        d.audit,
        "Nothing yet.",
      )}
    </div>`;
  }
}

registerSection({
  id: "accounts",
  label: "Accounts",
  order: 20,
  icon: () => userIcon(),
  render: (view) => html`<adm-accounts .view=${view}></adm-accounts>`,
});
