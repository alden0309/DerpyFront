// ADMIN (r26): Overview: the deployed commit, the server's health, who's on
// (Mr. Based shown honestly), games running, accounts, the database's size,
// the last errors, and what other sections add. Refreshes every 30 s.

import { html, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gaugeIcon } from "../icons";
import { AdminPage } from "../Page";
import { registerSection } from "../Registry";
import { accountLink, ago, bytes, nf, pill, span, table, when } from "../ui";

interface Worker {
  worker: number;
  uptimeS: number;
  rss: number;
  heapUsed: number;
  games: number;
  clients: number;
}

interface OverviewData {
  build: { commit: string | null; builtAt: string | null };
  server: {
    startedAt: string;
    uptimeS: number;
    node: string;
    memory: { rss: number; heapUsed: number; heapTotal: number };
    workers: Worker[];
    workersAnswered: boolean;
  };
  online: {
    id: number;
    username: string;
    place: string;
    hidden: boolean;
    listed: boolean;
    basedAt: string | null;
  }[];
  games: {
    frontLobbies: number | null;
    frontGames: number | null;
    frontPlayers: number | null;
    conquestRooms: number;
    conquestGames: number;
    conquestPlayers: number;
  };
  accounts: { total: number; newThisWeek: number; newToday: number };
  dbBytes: number;
  errors: { at: string; message: string; component?: string; where: string }[];
  lines: { label: string; value: string | number; href?: string }[];
}

@customElement("adm-overview")
export class AdminOverview extends AdminPage {
  @state() private data: OverviewData | null = null;
  @state() private at = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this.timer = setInterval(() => {
      if (!document.hidden) void this.reload();
    }, 30_000);
  }

  disconnectedCallback(): void {
    if (this.timer) clearInterval(this.timer);
    super.disconnectedCallback();
  }

  protected async fetch(): Promise<void> {
    this.data = await this.view.get<OverviewData>("/overview");
    this.at = Date.now();
  }

  render(): TemplateResult {
    const d = this.data;
    return html`<div class="adm-head">
        <div>
          <h1>Overview</h1>
          <p class="adm-sub">
            ${d ? html`As of ${when(this.at)}. It refreshes every 30 seconds.` : "Loading…"}
          </p>
        </div>
        <button class="dl-btn ghost small" @click=${() => void this.reload()}>
          Refresh
        </button>
      </div>
      ${this.error ? this.failed() : nothing} ${d ? this.body(d) : nothing}`;
  }

  private body(d: OverviewData): TemplateResult {
    const g = d.games;
    const commit = d.build.commit;
    return html`<div class="adm-grid">
      <div class="adm-stats">
        ${stat("Online now", nf(d.online.length))}
        ${stat(
          "DerpyFront",
          g.frontGames === null ? "–" : `${nf(g.frontGames)} playing`,
          g.frontLobbies === null ? "" : `${nf(g.frontLobbies)} lobbies`,
          "/admin/games",
        )}
        ${stat(
          "Derpy Conquest",
          `${nf(g.conquestGames)} playing`,
          `${nf(g.conquestRooms)} rooms`,
          "/admin/games",
        )}
        ${stat("Accounts", nf(d.accounts.total), `+${nf(d.accounts.newThisWeek)} in 7 days`, "/admin/accounts")}
        ${stat("Database", bytes(d.dbBytes))}
        ${stat("Up for", span(d.server.uptimeS))}
        ${stat("Memory", bytes(d.server.memory.rss), "the master")}
        ${d.lines.map((l) => stat(l.label, String(typeof l.value === "number" ? nf(l.value) : l.value), "", l.href))}
      </div>

      <div class="adm-cols">
        <div class="adm-box">
          <h2>Who's on now <span class="adm-aside">${nf(d.online.length)}</span></h2>
          ${table(
            [
              { label: "Player", lead: true, cell: (p) => accountLink(p.id, p.username) },
              { label: "Where", cell: (p) => p.place },
              {
                label: "",
                cell: (p) =>
                  html`${p.hidden ? pill("Appears offline") : nothing}
                  ${p.basedAt ? pill(`Mr. Based ${ago(p.basedAt)}`, "violet") : nothing}`,
              },
            ],
            d.online,
            "Nobody's on the site right now.",
          )}
        </div>
        <div class="adm-box">
          <h2>The server</h2>
          <dl class="adm-facts">
            <dt>Commit</dt>
            <dd>
              ${commit
                ? html`<a
                    class="adm-mono"
                    href="https://github.com/alden0309/DerpyFront/commit/${commit}"
                    target="_blank"
                    rel="noopener noreferrer"
                    title=${commit}
                    >${commit.length > 12 ? commit.slice(0, 10) : commit}</a
                  >`
                : "–"}
            </dd>
            <dt>Built</dt>
            <dd>${d.build.builtAt ? html`${when(d.build.builtAt)} <span class="adm-small">(${ago(d.build.builtAt)})</span>` : "Not built (running from source)"}</dd>
            <dt>Started</dt>
            <dd>${when(d.server.startedAt)}</dd>
            <dt>Memory</dt>
            <dd>
              ${bytes(d.server.memory.rss)} in all, heap
              ${bytes(d.server.memory.heapUsed)} of ${bytes(d.server.memory.heapTotal)}
            </dd>
            <dt>Node</dt>
            <dd>${d.server.node}</dd>
          </dl>
          <h2 class="adm-h2" style="margin-top:14px">Game workers</h2>
          ${d.server.workersAnswered
            ? table(
                [
                  { label: "Worker", lead: true, cell: (w) => `Worker ${w.worker}` },
                  { label: "Up for", cell: (w) => span(w.uptimeS) },
                  { label: "Memory", num: true, cell: (w) => bytes(w.rss) },
                  { label: "Games", num: true, cell: (w) => nf(w.games) },
                  { label: "Players", num: true, cell: (w) => nf(w.clients) },
                ],
                d.server.workers,
                "No game workers.",
              )
            : html`<p class="adm-quiet">The game workers didn't answer.</p>`}
        </div>
      </div>

      <div class="adm-box">
        <h2>Recent errors <span class="adm-aside">kept in memory since the last start</span></h2>
        ${table(
          [
            { label: "When", cls: "nowrap", cell: (e) => html`<span title=${when(e.at)}>${ago(e.at)}</span>` },
            { label: "Where", cls: "nowrap", cell: (e) => html`${e.where}${e.component ? html`<br /><span class="adm-small">${e.component}</span>` : nothing}` },
            { label: "Error", lead: true, cell: (e) => html`<span class="adm-mono">${e.message}</span>` },
          ],
          d.errors,
          "No errors since the last start.",
        )}
      </div>
    </div>`;
  }
}

function stat(
  label: string,
  value: string,
  small = "",
  href?: string,
): TemplateResult {
  const inner = html`<span class="k">${label}</span
    ><span class="v">${value}${small ? html`<small>${small}</small>` : nothing}</span>`;
  return html`<div class="adm-stat">
    ${href ? html`<a href=${href}>${inner}</a>` : inner}
  </div>`;
}

registerSection({
  id: "overview",
  label: "Overview",
  order: 10,
  icon: () => gaugeIcon(),
  render: (view) => html`<adm-overview .view=${view}></adm-overview>`,
});
