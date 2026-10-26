// ADMIN (r26): Games: every DerpyFront lobby and game running (private and
// matched ones too), every Derpy Conquest room, and the latest saved games.
// Close a lobby or end a game for everyone (they see the reason), close a
// Conquest room (its game is saved first), watch, open replays.

import { html, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gamesIcon } from "../icons";
import { AdminPage } from "../Page";
import { registerSection } from "../Registry";
import { ago, nf, pill, span, table, type Tone, when } from "../ui";

interface FrontGame {
  id: string;
  phase: "lobby" | "starting" | "playing";
  map: string;
  mode: string;
  scenario?: string;
  kind: string;
  createdAt: number;
  startedAt: number | null;
  players: string[];
  watchers: number;
  maxPlayers: number | null;
  locked: boolean;
  watchable: boolean;
}

interface Room {
  code: string;
  title: string;
  solo: boolean;
  open: boolean;
  locked: boolean;
  started: boolean;
  over: boolean;
  year: number | null;
  startedAt: number | null;
  paused: boolean;
  saveId: string | null;
  watchers: number;
  watchId: string | null;
  seats: { name: string; accountId: number | null; online: boolean }[];
}

interface GamesData {
  front: { available: boolean; games: FrontGame[] };
  conquest: { available: boolean; rooms: Room[] };
  recent: {
    derpyfront: {
      gameId: string;
      map: string;
      mode: string;
      type: string;
      scenario: string | null;
      endedAt: string;
      durationS: number;
      winner: string | null;
      players: number;
      accounts: string;
    }[];
    conquest: {
      gameId: string;
      endedAt: string;
      durationS: number;
      year: number;
      difficulty: string;
      winner: string | null;
      players: number;
      accounts: string;
    }[];
  };
}

const KIND: Record<string, [string, Tone]> = {
  public: ["Public", "blue"],
  listed: ["Listed", "blue"],
  private: ["Private", ""],
  matched: ["Matched", "violet"],
};

@customElement("adm-games")
export class AdminGames extends AdminPage {
  @state() private data: GamesData | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this.timer = setInterval(() => {
      if (!document.hidden && !this.busy) void this.reload();
    }, 15_000);
  }

  disconnectedCallback(): void {
    if (this.timer) clearInterval(this.timer);
    super.disconnectedCallback();
  }

  protected async fetch(): Promise<void> {
    this.data = await this.view.get<GamesData>("/games");
  }

  private async endFront(g: FrontGame): Promise<void> {
    const lobby = g.phase === "lobby";
    const ok = await this.view.confirm({
      title: lobby ? `Close lobby ${g.id}` : `End game ${g.id}`,
      body: `${g.scenario ?? g.map}, ${g.players.length} ${g.players.length === 1 ? "player" : "players"}. ${lobby ? "Everyone in it is sent back to the menu" : "It ends for everyone at once"}, with your reason on their screen.`,
      action: lobby ? "Close it" : "End it",
      danger: true,
      reason: "Reason (shown to the players)",
      reasonRequired: true,
    });
    if (!ok) return;
    await this.act(
      () =>
        this.view.post(`/games/front/${encodeURIComponent(g.id)}/end`, {
          reason: ok.reason,
        }),
      lobby ? "Lobby closed." : "Game ended.",
    );
  }

  private async closeRoom(r: Room): Promise<void> {
    const ok = await this.view.confirm({
      title: `Close "${r.title}"`,
      body: `${r.started ? "Its game is saved first, so it can be picked up again. " : ""}Everyone at the table goes back to the front screen, with your reason.`,
      action: "Close it",
      danger: true,
      reason: "Reason (shown to the players)",
      reasonRequired: true,
    });
    if (!ok) return;
    await this.act(
      () =>
        this.view.post(`/games/conquest/${encodeURIComponent(r.code)}/close`, {
          reason: ok.reason,
        }),
      "Room closed.",
    );
  }

  render(): TemplateResult {
    const d = this.data;
    return html`<div class="adm-head">
        <div>
          <h1>Games</h1>
          <p class="adm-sub">
            What's running now (it refreshes every 15 seconds), and the latest
            saved.
          </p>
        </div>
        <button class="dl-btn ghost small" @click=${() => void this.reload()}>
          Refresh
        </button>
      </div>
      ${this.error ? this.failed() : nothing}
      ${d ? this.body(d) : html`<p class="adm-quiet">Loading…</p>`}`;
  }

  private body(d: GamesData): TemplateResult {
    const now = Date.now();
    return html`<div class="adm-grid">
      <div class="adm-box">
        <h2>
          DerpyFront
          <span class="adm-aside"
            >${nf(d.front.games.length)} lobbies and games</span
          >
        </h2>
        ${d.front.available
          ? table(
              [
                {
                  label: "Game",
                  lead: true,
                  cell: (g) =>
                    html`${g.scenario ?? g.map}
                      <span class="adm-small adm-mono">${g.id}</span>`,
                },
                {
                  label: "Kind",
                  cell: (g) =>
                    html`${pill(...(KIND[g.kind] ?? [g.kind, ""]))}
                    ${g.locked ? pill("Password") : nothing}
                    ${g.mode === "Team" ? pill("Teams") : nothing}`,
                },
                {
                  label: "State",
                  cell: (g) =>
                    g.phase === "lobby"
                      ? html`${pill("Lobby", "warn")}
                          <span class="adm-small"
                            >${ago(g.createdAt, now)}</span
                          >`
                      : html`${pill(
                          g.phase === "playing" ? "Playing" : "Starting",
                          "good",
                        )}
                        ${g.startedAt
                          ? html`<span class="adm-small"
                              >${span((now - g.startedAt) / 1000)}</span
                            >`
                          : nothing}`,
                },
                {
                  label: "Players",
                  cell: (g) =>
                    html`<span title=${g.players.join(", ")}
                      >${nf(g.players.length)}${g.maxPlayers
                        ? ` / ${g.maxPlayers}`
                        : ""}${g.players.length
                        ? html` <span class="adm-small"
                            >${g.players.slice(0, 4).join(", ")}${g.players
                              .length > 4
                              ? "…"
                              : ""}</span
                          >`
                        : nothing}</span
                    >`,
                },
                { label: "Watching", num: true, cell: (g) => nf(g.watchers) },
                {
                  label: "",
                  cls: "acts",
                  cell: (g) =>
                    html`${g.phase === "playing"
                        ? g.watchable
                          ? html`<a
                              class="dl-btn small tiny ghost"
                              href="/game/${encodeURIComponent(g.id)}?spectate"
                              target="_blank"
                              >Watch</a
                            >`
                          : html`<span
                              class="adm-small"
                              title="Its host hasn't opened it to watchers"
                              >No watchers</span
                            >`
                        : nothing}
                      <button
                        class="dl-btn small tiny adm-danger ghost"
                        ?disabled=${this.busy}
                        @click=${() => void this.endFront(g)}
                      >
                        ${g.phase === "lobby" ? "Close" : "End"}
                      </button>`,
                },
              ],
              d.front.games,
              "No lobbies or games on the game workers right now.",
            )
          : html`<p class="adm-quiet">The game workers didn't answer.</p>`}
      </div>

      <div class="adm-box">
        <h2>
          Derpy Conquest
          <span class="adm-aside">${nf(d.conquest.rooms.length)} rooms</span>
        </h2>
        ${table(
          [
            {
              label: "Room",
              lead: true,
              cell: (r) =>
                html`${r.title}
                  <span class="adm-small adm-mono">${r.code}</span>`,
            },
            {
              label: "Kind",
              cell: (r) =>
                html`${r.solo
                  ? pill("Solo")
                  : r.open
                    ? pill("Open", "blue")
                    : pill("Private")}
                ${r.locked ? pill("Password") : nothing}`,
            },
            {
              label: "State",
              cell: (r) =>
                r.over
                  ? pill("Over")
                  : r.started
                    ? html`${pill(
                        r.paused ? "Paused" : "Playing",
                        r.paused ? "warn" : "good",
                      )}
                      ${r.year ?? ""}`
                    : pill("Setting up", "warn"),
            },
            {
              label: "Seats",
              cell: (r) =>
                html`${r.seats.map(
                  (s, i) =>
                    html`${i ? ", " : ""}<span
                        style=${s.online ? "" : "opacity:.55"}
                        title=${s.online ? "At the table" : "Away"}
                        >${s.accountId
                          ? html`<a href="/admin/accounts/${s.accountId}"
                              >${s.name}</a
                            >`
                          : s.name}</span
                      >`,
                )}`,
            },
            { label: "Watching", num: true, cell: (r) => nf(r.watchers) },
            {
              label: "",
              cls: "acts",
              cell: (r) =>
                html`${r.watchId
                    ? html`<a
                        class="dl-btn small tiny ghost"
                        href="/conquest?watch=${encodeURIComponent(r.watchId)}"
                        target="_blank"
                        >Watch</a
                      >`
                    : nothing}
                  <button
                    class="dl-btn small tiny adm-danger ghost"
                    ?disabled=${this.busy}
                    @click=${() => void this.closeRoom(r)}
                  >
                    Close
                  </button>`,
            },
          ],
          d.conquest.rooms,
          "No Conquest rooms open.",
        )}
      </div>

      <div class="adm-cols">
        <div class="adm-box">
          <h2>Latest DerpyFront games saved</h2>
          ${table(
            [
              {
                label: "Game",
                lead: true,
                cell: (g) =>
                  html`${g.scenario ?? g.map}
                    <span class="adm-small">${g.type}</span>`,
              },
              {
                label: "Ended",
                cls: "nowrap",
                cell: (g) =>
                  html`<span title=${when(g.endedAt)}>${ago(g.endedAt)}</span>`,
              },
              {
                label: "Players",
                cell: (g) =>
                  html`${g.players}
                    <span class="adm-small">${g.accounts}</span>`,
              },
              { label: "Winner", cell: (g) => g.winner ?? "–" },
              {
                label: "",
                cls: "acts",
                cell: (g) =>
                  html`<a
                    class="dl-btn small tiny ghost"
                    href="/game/${encodeURIComponent(g.gameId)}"
                    target="_blank"
                    >Replay</a
                  >`,
              },
            ],
            d.recent.derpyfront,
            "No saved games yet.",
          )}
        </div>
        <div class="adm-box">
          <h2>Latest Derpy Conquest games finished</h2>
          ${table(
            [
              {
                label: "Game",
                lead: true,
                cell: (g) =>
                  html`To ${g.year}
                    <span class="adm-small">${g.difficulty}</span>`,
              },
              {
                label: "Ended",
                cls: "nowrap",
                cell: (g) =>
                  html`<span title=${when(g.endedAt)}>${ago(g.endedAt)}</span>`,
              },
              {
                label: "Players",
                cell: (g) =>
                  html`${g.players}
                    <span class="adm-small">${g.accounts}</span>`,
              },
              { label: "Winner", cell: (g) => g.winner ?? "–" },
              {
                label: "",
                cls: "acts",
                cell: (g) =>
                  html`<a
                    class="dl-btn small tiny ghost"
                    href="/chronicle/${encodeURIComponent(g.gameId)}"
                    target="_blank"
                    >Story</a
                  >`,
              },
            ],
            d.recent.conquest,
            "No finished games yet.",
          )}
        </div>
      </div>
    </div>`;
  }
}

registerSection({
  id: "games",
  label: "Games",
  order: 40,
  icon: () => gamesIcon(),
  render: (view) => html`<adm-games .view=${view}></adm-games>`,
});
