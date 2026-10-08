// Derp Land: the site around the games. One shell for every hub page (the
// front page, Store, Inventory, Leaderboard, your account and other
// players' pages), picked from the URL, under the shared top bar.

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api } from "../derpland/Account";
import "../derpland/DerpBar";
import { BarPage, openSignIn } from "../derpland/DerpBar";
import {
  coinIcon,
  crownIcon,
  hourglassIcon,
  pawnIcon,
  peopleIcon,
  scrollIcon,
} from "../derpland/Icons";
import { nationName, nf, timeAgo } from "./format";
import { HubPage } from "./HubPage";
import "./Leaderboard";
import "./Profile";
import "./Store";

export const SOURCE_CODE_URL =
  "https://github.com/alden0309/DerpyFront/tree/capital-mod";
export const CREDITS = [
  "Made by: Alden",
  "Taped by Michael",
  "Robert'd by Gary",
] as const;

type Route =
  | { page: "home" | "store" | "inventory" | "leaderboard" | "account" }
  | { page: "player"; name: string };

export function routeFor(path: string): Route {
  const p = path.replace(/\/+$/, "") || "/";
  const player = /^\/player\/([A-Za-z0-9_]{1,20})$/.exec(p);
  if (player) return { page: "player", name: player[1] };
  switch (p) {
    case "/store":
      return { page: "store" };
    case "/inventory":
      return { page: "inventory" };
    case "/leaderboard":
      return { page: "leaderboard" };
    case "/account":
      return { page: "account" };
    default:
      return { page: "home" };
  }
}

const TITLES: Record<Route["page"], string> = {
  home: "Derp Land",
  store: "Derp Store · Derp Land",
  inventory: "Inventory · Derp Land",
  leaderboard: "Leaderboard · Derp Land",
  account: "Your account · Derp Land",
  player: "Player · Derp Land",
};

@customElement("derp-land")
export class DerpLand extends LitElement {
  @state() private route: Route = routeFor(location.pathname);

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    document.title =
      this.route.page === "player"
        ? `${this.route.name} · Derp Land`
        : TITLES[this.route.page];
  }

  render(): TemplateResult {
    const r = this.route;
    const bar: BarPage = r.page === "player" ? "leaderboard" : r.page;
    return html`
      <derp-bar page=${bar}></derp-bar>
      <main class="dl-main">${this.renderPage(r)}</main>
      ${renderFooter()}
    `;
  }

  private renderPage(r: Route): TemplateResult {
    switch (r.page) {
      case "store":
        return html`<dl-store></dl-store>`;
      case "inventory":
        return html`<dl-inventory></dl-inventory>`;
      case "leaderboard":
        return html`<dl-leaderboard></dl-leaderboard>`;
      case "account":
        return html`<dl-profile self></dl-profile>`;
      case "player":
        return html`<dl-profile name=${r.name}></dl-profile>`;
      default:
        return html`<dl-home></dl-home>`;
    }
  }
}

interface Recent {
  game: "derpyfront" | "conquest";
  gameId: string;
  endedAt: string;
  username: string;
  playedAs?: string;
  won: boolean;
  where: string;
  numPlayers: number;
  coins: number;
}

interface TopRow {
  username: string;
  wins: number;
  games: number;
}

@customElement("dl-home")
export class DerpHome extends HubPage {
  @state() private recent: Recent[] | null = null;
  @state() private top: TopRow[] | null = null;
  @state() private offline = false;

  protected async load(): Promise<void> {
    try {
      const [recent, top] = await Promise.all([
        api<{ results: Recent[] }>("/recent"),
        api<{ players: TopRow[] }>("/leaderboard?game=overall"),
      ]);
      this.recent = recent.results;
      this.top = top.players.filter((p) => p.games > 0).slice(0, 5);
    } catch {
      this.offline = true;
      this.recent = [];
      this.top = [];
    }
  }

  render(): TemplateResult {
    return html`
      <section class="dl-intro">
        <h1 class="dl-hello">
          ${this.username ? `Pick a game, ${this.username}.` : "Pick a game."}
        </h1>
        <p class="dl-lede">
          ${this.account
            ? html`You have
                <span class="dl-inline-coins"
                  >${coinIcon("dl-coin")} ${nf(this.account.coins)}</span
                >
                Derp Coins. Every game you finish adds more, and the
                <a href="/store">Store</a> turns them into skins.`
            : html`Two strategy games on one account. Every game you finish
                signed in pays Derp Coins you can spend on skins.
                <button class="dl-textbtn" @click=${() => openSignIn("create")}>
                  Make an account
                </button>`}
        </p>
      </section>

      <section class="dl-shelf" aria-label="Games">
        ${box({
          id: "derpyfront",
          href: "/derpyfront",
          art: "/derpland/derpyfront-box.webp",
          logo: html`<span class="dl-logo-front">DerpyFront</span>`,
          pitch:
            "A real-time land grab on real maps. Build cities and ports, raise a Capital, sign trade deals, then break them.",
          facts: [
            [peopleIcon(), "Solo or online"],
            [hourglassIcon(), "15 to 40 min"],
            [pawnIcon(), "Real time"],
          ],
          cta: "Play DerpyFront",
        })}
        ${box({
          id: "conquest",
          href: "/conquest",
          art: "/derpland/conquest-box.webp",
          logo: html`<span class="dl-logo-conquest">Derpy Conquest</span>`,
          pitch:
            "Govern a colony in the 1600s Americas. Keep the crown paid, the settlers fed and the neighbors talking, or go your own way.",
          facts: [
            [peopleIcon(), "1 to 6 players"],
            [scrollIcon(), "Saved between sittings"],
            [hourglassIcon(), "Pause any time"],
          ],
          cta: "Play Derpy Conquest",
          sticker: "New",
        })}
      </section>

      <section class="dl-below">
        <div class="dl-panel dl-feed">
          <h2 class="dl-h2">Latest games</h2>
          ${this.renderRecent()}
        </div>
        <div class="dl-panel dl-top">
          <h2 class="dl-h2">Top players</h2>
          ${this.renderTop()}
          <a class="dl-more" href="/leaderboard">Full leaderboard</a>
        </div>
      </section>
    `;
  }

  private renderRecent(): TemplateResult {
    if (this.recent === null) return html`<p class="dl-quiet">Loading…</p>`;
    if (this.offline)
      return html`<p class="dl-quiet">
        Game results aren't available on this server.
      </p>`;
    if (this.recent.length === 0)
      return html`<p class="dl-quiet">
        No finished games yet. Yours could be the first one here.
      </p>`;
    const now = Date.now();
    return html`<ol class="dl-feed-list">
      ${this.recent.map(
        (r) =>
          html`<li class="${r.game} ${r.won ? "won" : ""}">
            <span class="dl-feed-text">
              <a href="/player/${r.username}">${r.username}</a>
              ${r.playedAs
                ? html`<span class="dl-feed-alias">(as ${r.playedAs})</span>`
                : nothing}
              ${r.won ? "won" : "played"}
              ${r.game === "derpyfront"
                ? html`DerpyFront on <b>${r.where}</b>`
                : html`Derpy Conquest as <b>${nationName(r.where)}</b>`}
              ${r.won ? crownIcon("dl-i dl-crown") : nothing}
            </span>
            <span class="dl-feed-coins"
              >+${nf(r.coins)} ${coinIcon("dl-coin sm")}</span
            >
            <span class="dl-feed-when">${timeAgo(r.endedAt, now)}</span>
          </li>`,
      )}
    </ol>`;
  }

  private renderTop(): TemplateResult {
    if (this.top === null) return html`<p class="dl-quiet">Loading…</p>`;
    if (this.top.length === 0)
      return html`<p class="dl-quiet">Nobody's on the board yet.</p>`;
    return html`<ol class="dl-top-list">
      ${this.top.map(
        (p, i) =>
          html`<li>
            <span class="dl-place p${i + 1}">${i + 1}</span>
            <a href="/player/${p.username}">${p.username}</a>
            <span class="dl-top-wins"
              >${p.wins} ${p.wins === 1 ? "win" : "wins"}</span
            >
          </li>`,
      )}
    </ol>`;
  }
}

function box(g: {
  id: string;
  href: string;
  art: string;
  logo: TemplateResult;
  pitch: string;
  facts: [TemplateResult, string][];
  cta: string;
  sticker?: string;
}): TemplateResult {
  return html`<a class="dl-box ${g.id}" href=${g.href}>
    <span class="dl-lid">
      <img src=${g.art} alt="" width="1200" height="750" />
      <span class="dl-logo">${g.logo}</span>
    </span>
    ${g.sticker ? html`<span class="dl-sticker">${g.sticker}</span>` : nothing}
    <span class="dl-side">
      <span class="dl-pitch">${g.pitch}</span>
      <span class="dl-facts">
        ${g.facts.map(
          ([icon, text]) => html`<span class="dl-fact">${icon}${text}</span>`,
        )}
      </span>
      <span class="dl-cta">${g.cta}</span>
    </span>
  </a>`;
}

function renderFooter(): TemplateResult {
  return html`<footer class="dl-foot">
    <p class="dl-hey">Hey Buddy</p>
    <p class="dl-credits">${CREDITS.map((c) => html`<span>${c}</span>`)}</p>
    <p class="dl-legal">
      <a href="/terms-of-service.html" target="_blank">Terms of Service</a>
      <a href="/privacy-policy.html" target="_blank">Privacy Policy</a>
      <a href=${SOURCE_CODE_URL} target="_blank" rel="noopener noreferrer"
        >Source</a
      >
      <span
        >DerpyFront is based on OpenFront (AGPL-3.0). © OpenFront and
        Contributors.</span
      >
      <span>Derpy Conquest map data: Natural Earth.</span>
    </p>
  </footer>`;
}
