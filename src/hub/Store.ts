// The Derp Store (skin packs for Derp Coins) and your Inventory (the skins
// you own, and which one your DerpyFront territory wears).

import { html, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  ApiError,
  buyPack,
  Pack,
  storePacks,
  wearSkin,
  wornSkin,
} from "../derpland/Account";
import { openSignIn } from "../derpland/DerpBar";
import { bananaMark, chestIcon, coinIcon, stallIcon } from "../derpland/Icons";
import { nf } from "./format";
import { HubPage } from "./HubPage";

let packsCache: Promise<Pack[]> | null = null;
function packs(): Promise<Pack[]> {
  packsCache ??= storePacks().catch((e) => {
    packsCache = null;
    throw e;
  });
  return packsCache;
}

@customElement("dl-store")
export class DerpStore extends HubPage {
  @state() private packs: Pack[] | null = null;
  @state() private error: string | null = null;
  @state() private buying: string | null = null;
  @state() private notice: { pack: string; ok: boolean; text: string } | null =
    null;

  protected async load(): Promise<void> {
    try {
      this.packs = await packs();
    } catch (e) {
      this.error =
        e instanceof ApiError && e.code === "accounts_unavailable"
          ? "The store isn't open on this server."
          : "Couldn't load the store. Refresh to try again.";
    }
  }

  private owns(item: string): boolean {
    return this.account?.owned.includes(item) ?? false;
  }

  private async buy(p: Pack): Promise<void> {
    this.buying = p.name;
    this.notice = null;
    try {
      const r = await buyPack(p.name);
      if (this.account) {
        this.account = { ...this.account, coins: r.coins, owned: r.owned };
      }
      if (wornSkin() === null && p.skins.length > 0) wearSkin(p.skins[0].name);
      this.notice = {
        pack: p.name,
        ok: true,
        text: `${p.displayName} is yours.`,
      };
    } catch (e) {
      this.notice = {
        pack: p.name,
        ok: false,
        text:
          e instanceof ApiError && e.code === "not_enough_coins"
            ? "You don't have enough Derp Coins for this pack yet."
            : "That didn't go through, and no coins were taken. Try again.",
      };
    } finally {
      this.buying = null;
    }
  }

  render(): TemplateResult {
    return html`
      <header class="dl-pagehead">
        <span class="dl-pageicon">${stallIcon()}</span>
        <div>
          <h1 class="dl-h1">Derp Store</h1>
          <p class="dl-lede">
            Skin packs for your territory in DerpyFront, paid for with the Derp
            Coins you win in either game.
          </p>
        </div>
        ${this.account
          ? html`<span class="dl-balance"
              >${coinIcon("dl-coin")}<b>${nf(this.account.coins)}</b>
              <span>to spend</span></span
            >`
          : nothing}
      </header>
      ${this.error
        ? html`<p class="dl-panel dl-quiet">${this.error}</p>`
        : this.packs === null
          ? html`<p class="dl-quiet">Loading…</p>`
          : html`<div class="dl-packs">
              ${this.packs.map((p) => this.renderPack(p))}
            </div>`}
    `;
  }

  private renderPack(p: Pack): TemplateResult {
    const owned = this.owns(`pack:${p.name}`);
    const coins = this.account?.coins ?? 0;
    const short = Math.max(0, p.price - coins);
    let action: TemplateResult;
    if (owned) {
      action = html`<span class="dl-owned">Owned</span>
        <a class="dl-btn ghost" href="/inventory">Wear one</a>`;
    } else if (!this.username) {
      action = html`<button class="dl-btn" @click=${() => openSignIn()}>
        Sign in to buy
      </button>`;
    } else {
      action = html`<button
        class="dl-btn"
        ?disabled=${short > 0 || this.buying !== null}
        @click=${() => this.buy(p)}
      >
        ${this.buying === p.name
          ? "Buying…"
          : short > 0
            ? `${nf(short)} more coins needed`
            : `Buy for ${nf(p.price)}`}
      </button>`;
    }
    const note = this.notice?.pack === p.name ? this.notice : null;
    return html`<article class="dl-pack ${owned ? "is-owned" : ""}">
      <div class="dl-pack-head">
        <div>
          <h2 class="dl-pack-name">${p.displayName}</h2>
          <p class="dl-pack-desc">${p.description}</p>
        </div>
        <span class="dl-tag" aria-label="${p.price} Derp Coins"
          >${coinIcon("dl-coin")}${nf(p.price)}</span
        >
      </div>
      ${!owned && this.account && short > 0
        ? html`<div
            class="dl-saving"
            role="img"
            aria-label="${nf(coins)} of ${nf(p.price)} Derp Coins saved"
          >
            <span class="dl-saving-bar"
              ><i style="width:${Math.min(100, (coins / p.price) * 100)}%"></i
            ></span>
            <span class="dl-saving-text"
              >${nf(coins)} of ${nf(p.price)} saved</span
            >
          </div>`
        : nothing}
      <ul class="dl-skins">
        ${p.skins.map(
          (s) =>
            html`<li>
              <img src=${s.url} alt="" loading="lazy" />
              <span>${s.displayName}</span>
            </li>`,
        )}
      </ul>
      <div class="dl-pack-foot">
        ${note
          ? html`<p class="dl-note ${note.ok ? "ok" : "bad"}" role="status">
              ${note.text}
            </p>`
          : html`<span></span>`}
        <div class="dl-pack-actions">${action}</div>
      </div>
    </article>`;
  }
}

@customElement("dl-inventory")
export class DerpInventory extends HubPage {
  @state() private packs: Pack[] | null = null;
  @state() private worn: string | null = wornSkin();
  @state() private error = false;

  protected async load(): Promise<void> {
    try {
      this.packs = await packs();
    } catch {
      this.error = true;
    }
  }

  private wear(name: string | null): void {
    wearSkin(name);
    this.worn = wornSkin();
  }

  render(): TemplateResult {
    return html`
      <header class="dl-pagehead">
        <span class="dl-pageicon">${chestIcon()}</span>
        <div>
          <h1 class="dl-h1">Inventory</h1>
          <p class="dl-lede">
            Pick the skin your territory wears in DerpyFront. Everyone in the
            game sees it. Flags and free patterns are in
            <a href="/derpyfront#modal=inventory">DerpyFront's inventory</a>.
          </p>
        </div>
      </header>
      ${this.renderBody()}
    `;
  }

  private renderBody(): TemplateResult {
    if (!this.username) {
      return html`<div class="dl-panel dl-empty">
        <p>Sign in to see the skins you own.</p>
        <button class="dl-btn" @click=${() => openSignIn()}>Sign in</button>
      </div>`;
    }
    if (this.error)
      return html`<p class="dl-panel dl-quiet">
        Couldn't load your skins. Refresh to try again.
      </p>`;
    if (this.packs === null || this.account === null)
      return html`<p class="dl-quiet">Loading…</p>`;
    const owned = this.packs.flatMap((p) =>
      p.skins
        .filter((s) => this.account!.owned.includes(`skin:${s.name}`))
        .map((s) => ({ ...s, pack: p.displayName })),
    );
    if (owned.length === 0) {
      return html`<div class="dl-panel dl-empty with-mascot">
        ${bananaMark("dl-banana mid")}
        <div>
          <p>
            Nothing in here yet. Packs start at
            ${nf(Math.min(...this.packs.map((p) => p.price)))} Derp Coins, and
            every game you finish signed in earns some.
          </p>
          <a class="dl-btn" href="/store">Go to the Store</a>
        </div>
      </div>`;
    }
    const tile = (
      name: string | null,
      label: string,
      sub: string,
      img: TemplateResult,
    ) => {
      const on = this.worn === name;
      return html`<li>
        <button
          class="dl-skin ${on ? "on" : ""}"
          aria-pressed=${on}
          @click=${() => this.wear(name)}
        >
          ${img}
          <span class="dl-skin-name">${label}</span>
          <span class="dl-skin-sub">${sub}</span>
          <span class="dl-skin-state">${on ? "Wearing" : "Wear"}</span>
        </button>
      </li>`;
    };
    return html`<ul class="dl-locker">
      ${tile(
        null,
        "No skin",
        "Your plain color",
        html`<span class="dl-skin-none" aria-hidden="true"></span>`,
      )}
      ${owned.map((s) =>
        tile(
          s.name,
          s.displayName,
          s.pack,
          html`<img src=${s.url} alt="" loading="lazy" />`,
        ),
      )}
    </ul>`;
  }
}
