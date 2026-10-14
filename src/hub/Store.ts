// The Derp Store and your Inventory. Since DFSTORE (r21) both are tabbed by
// game (DerpyFront, Derpy Conquest) and then by category: skin packs, AI
// personalities, Nuke & Dome effects and victory fanfares for DerpyFront;
// start dates, map styles and add-ons for Conquest (SITE r22's tabs).

import { DERPY_FX_THEMES } from "@openfront/shared/DerpyFx";
import { html, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  nukeStyleIn,
  storedEffectSlots,
  storeEffectSlots,
  wearDomeStyle,
  withNukeStyle,
  wornDomeStyle,
} from "../client/derpy/DerpyLooks";
import {
  chooseFanfare,
  chosenFanfare,
  FanfareName,
  FanfarePlayback,
  isFanfare,
  playFanfare,
} from "../client/derpy/Fanfares";
import {
  ApiError,
  buyItem,
  StoreCatalog,
  storeCatalog,
  StoreItem,
  StoreTab,
  wearSkin,
  wornSkin,
} from "../derpland/Account";
import { openSignIn } from "../derpland/DerpBar";
import { bananaMark, chestIcon, coinIcon, stallIcon } from "../derpland/Icons";
import {
  conquestFeatures,
  ensurePreviewStyles,
  fxPreview,
  mapStylePreview,
  personaCard,
} from "../derpland/StorePreviews";
// DLC (r21): the map style you use in Derpy Conquest, chosen here too.
import {
  chooseMapStyle,
  chosenMapStyle,
} from "../conquest/client/MapStylePref";
import { MAP_STYLES, type MapStyleKey } from "../conquest/DlcIds";
import {
  itemsInTab,
  ownedInTab,
  ownsItem,
  StoreTabChoice,
  tabCounts,
  tabFromHash,
  tabHash,
  tabKey,
} from "../derpland/StoreTabs";
import { nf } from "./format";
import { HubPage } from "./HubPage";

let catalogCache: Promise<StoreCatalog> | null = null;
function catalog(): Promise<StoreCatalog> {
  catalogCache ??= storeCatalog().catch((e) => {
    catalogCache = null;
    throw e;
  });
  return catalogCache;
}

let preview: FanfarePlayback | null = null;
function listen(name: string): void {
  if (!isFanfare(name)) return;
  preview?.stop();
  preview = playFanfare(name, { volume: 0.6 });
}

/** The game tabs, then the chosen game's category tabs. */
function tabBar(
  tabs: readonly StoreTab[],
  tab: StoreTabChoice,
  counts: Map<string, number>,
  pick: (t: StoreTabChoice) => void,
): TemplateResult {
  const game = tabs.find((t) => t.game === tab.game) ?? tabs[0];
  return html`<nav class="dl-storetabs" aria-label="Store sections">
    <div class="dl-gametabs" role="tablist" aria-label="Which game">
      ${tabs.map(
        (t) =>
          html`<button
            role="tab"
            class="dl-gametab"
            data-game=${t.game}
            aria-selected=${t.game === tab.game}
            @click=${() =>
              pick({ game: t.game, category: t.categories[0]?.id ?? "" })}
          >
            ${t.label}
          </button>`,
      )}
    </div>
    <div class="dl-seg dl-cattabs" role="tablist" aria-label="Category">
      ${game?.categories.map((c) => {
        const n = counts.get(tabKey({ game: game.game, category: c.id })) ?? 0;
        return html`<button
          role="tab"
          aria-selected=${c.id === tab.category}
          @click=${() => pick({ game: game.game, category: c.id })}
        >
          ${c.label}<span class="dl-tabcount">${n}</span>
        </button>`;
      })}
    </div>
  </nav>`;
}

function blurbOf(tabs: readonly StoreTab[], tab: StoreTabChoice): string {
  return (
    tabs
      .find((t) => t.game === tab.game)
      ?.categories.find((c) => c.id === tab.category)?.blurb ?? ""
  );
}

function labelOf(tabs: readonly StoreTab[], tab: StoreTabChoice): string {
  return (
    tabs
      .find((t) => t.game === tab.game)
      ?.categories.find((c) => c.id === tab.category)?.label ?? ""
  );
}

/** A tab's state kept in the address (#derpyfront/effects). */
function readTab(tabs: readonly StoreTab[]): StoreTabChoice {
  return tabFromHash(window.location.hash, tabs);
}

function writeTab(tab: StoreTabChoice): void {
  history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${tabHash(tab)}`,
  );
}

/** What an item holds, under its name: skins, personas, the effect, music. */
function itemBody(item: StoreItem): TemplateResult | typeof nothing {
  if (item.skins) {
    return html`<ul class="dl-skins">
      ${item.skins.map(
        (s) =>
          html`<li>
            <img src=${s.url} alt="" loading="lazy" />
            <span>${s.displayName}</span>
          </li>`,
      )}
    </ul>`;
  }
  if (item.personas) {
    return html`<ul class="dfx-personas dl-itembody">
      ${item.personas.map((p) => personaCard(p))}
    </ul>`;
  }
  if (item.fx) {
    return html`<div class="dl-itembody">
      ${fxPreview(item.name, item.fx)}
    </div>`;
  }
  if (item.fanfare) {
    return html`<div class="dl-itembody dl-fanfare">
      <button class="dl-btn ghost" @click=${() => listen(item.name)}>
        <span aria-hidden="true">▶</span> Listen
      </button>
      <span class="dl-quiet"
        >${item.fanfare.instruments} · ${item.fanfare.seconds} seconds</span
      >
    </div>`;
  }
  // DLC (r21): a Derpy Conquest item: a corner of the map in its style, or what it adds.
  if (item.conquest) {
    return html`<div class="dl-itembody">
      ${item.conquest.palette
        ? mapStylePreview(
            item.name,
            item.name.replace(/^map_/, ""),
            item.conquest.palette,
          )
        : nothing}
      ${conquestFeatures(item.conquest.features)}
      <p class="dl-quiet dl-howto">${item.conquest.howTo}</p>
    </div>`;
  }
  return nothing;
}

@customElement("dl-store")
export class DerpStore extends HubPage {
  @state() private catalog: StoreCatalog | null = null;
  @state() private tab: StoreTabChoice | null = null;
  @state() private error: string | null = null;
  @state() private buying: string | null = null;
  @state() private notice: { item: string; ok: boolean; text: string } | null =
    null;

  protected async load(): Promise<void> {
    ensurePreviewStyles();
    try {
      this.catalog = await catalog();
      this.tab = readTab(this.catalog.tabs);
    } catch (e) {
      this.error =
        e instanceof ApiError && e.code === "accounts_unavailable"
          ? "The store isn't open on this server."
          : "Couldn't load the store. Refresh to try again.";
    }
  }

  private owns(item: StoreItem): boolean {
    return ownsItem(this.account?.owned ?? [], item);
  }

  private pick(t: StoreTabChoice): void {
    this.tab = t;
    this.notice = null;
    writeTab(t);
  }

  private async buy(item: StoreItem): Promise<void> {
    this.buying = item.name;
    this.notice = null;
    try {
      const r = await buyItem(item.name);
      if (this.account) {
        this.account = { ...this.account, coins: r.coins, owned: r.owned };
      }
      // Something new to use straight away, if nothing of its kind is on.
      if (item.skins && wornSkin() === null && item.skins.length > 0) {
        wearSkin(item.skins[0].name);
      }
      if (item.fx) {
        const theme = DERPY_FX_THEMES.find((t) => t.name === item.name);
        if (theme && nukeStyleIn(storedEffectSlots()) === null) {
          storeEffectSlots(withNukeStyle(storedEffectSlots(), theme));
        }
        if (wornDomeStyle() === null) wearDomeStyle(item.name);
      }
      if (item.fanfare && chosenFanfare() === null && isFanfare(item.name)) {
        chooseFanfare(item.name);
      }
      this.notice = {
        item: item.name,
        ok: true,
        text: `${item.displayName} is yours.`,
      };
    } catch (e) {
      this.notice = {
        item: item.name,
        ok: false,
        text:
          e instanceof ApiError && e.code === "not_enough_coins"
            ? "You don't have enough Derp Coins for this yet."
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
            Skins, AI personalities, effects and fanfares for DerpyFront; start
            dates, map styles and add-ons for Derpy Conquest. Paid for with the
            Derp Coins you win in either game.
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
        : this.catalog === null || this.tab === null
          ? html`<p class="dl-quiet">Loading…</p>`
          : this.renderTab(this.catalog, this.tab)}
    `;
  }

  private renderTab(cat: StoreCatalog, tab: StoreTabChoice): TemplateResult {
    const items = itemsInTab(cat.items, tab);
    return html`
      ${tabBar(cat.tabs, tab, tabCounts(cat.items, cat.tabs), (t) =>
        this.pick(t),
      )}
      <p class="dl-tabblurb">${blurbOf(cat.tabs, tab)}</p>
      ${items.length === 0
        ? html`<div class="dl-panel dl-empty with-mascot">
            ${bananaMark("dl-banana mid")}
            <div>
              <p>
                Nothing here yet. ${labelOf(cat.tabs, tab)} for
                ${cat.tabs.find((t) => t.game === tab.game)?.label} are on their
                way.
              </p>
            </div>
          </div>`
        : html`<div class="dl-packs">
            ${items.map((i) => this.renderItem(i))}
          </div>`}
    `;
  }

  private renderItem(item: StoreItem): TemplateResult {
    const owned = this.owns(item);
    const coins = this.account?.coins ?? 0;
    const short = Math.max(0, item.price - coins);
    let action: TemplateResult;
    if (owned) {
      action = html`<span class="dl-owned">Owned</span>
        <a class="dl-btn ghost" href=${`/inventory${tabHash(item)}`}
          >${item.category === "personalities" ||
          item.category === "startdates" || // SITE (r22)
          item.category === "addons"
            ? "See it"
            : "Use it"}</a
        >`;
    } else if (!this.username) {
      action = html`<button class="dl-btn" @click=${() => openSignIn()}>
        Sign in to buy
      </button>`;
    } else {
      action = html`<button
        class="dl-btn"
        ?disabled=${short > 0 || this.buying !== null}
        @click=${() => this.buy(item)}
      >
        ${this.buying === item.name
          ? "Buying…"
          : short > 0
            ? `${nf(short)} more coins needed`
            : `Buy for ${nf(item.price)}`}
      </button>`;
    }
    const note = this.notice?.item === item.name ? this.notice : null;
    return html`<article
      class="dl-pack ${owned ? "is-owned" : ""}"
      data-item=${item.name}
    >
      <div class="dl-pack-head">
        <div>
          <h2 class="dl-pack-name">${item.displayName}</h2>
          <p class="dl-pack-desc">${item.description}</p>
        </div>
        <span class="dl-tag" aria-label="${item.price} Derp Coins"
          >${coinIcon("dl-coin")}${nf(item.price)}</span
        >
      </div>
      ${!owned && this.account && short > 0
        ? html`<div
            class="dl-saving"
            role="img"
            aria-label="${nf(coins)} of ${nf(item.price)} Derp Coins saved"
          >
            <span class="dl-saving-bar"
              ><i
                style="width:${Math.min(100, (coins / item.price) * 100)}%"
              ></i
            ></span>
            <span class="dl-saving-text"
              >${nf(coins)} of ${nf(item.price)} saved</span
            >
          </div>`
        : nothing}
      ${itemBody(item)}
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
  @state() private catalog: StoreCatalog | null = null;
  @state() private tab: StoreTabChoice | null = null;
  @state() private worn: string | null = wornSkin();
  @state() private nukeStyle: string | null = nukeStyleIn(storedEffectSlots());
  @state() private domeStyle: string | null = wornDomeStyle();
  @state() private fanfare: FanfareName | null = chosenFanfare();
  /** DLC (r21): Derpy Conquest's map style (kept in this browser). */
  @state() private mapStyle: string | null = chosenMapStyle()
    ? `map_${chosenMapStyle()}`
    : null;
  @state() private error = false;

  protected async load(): Promise<void> {
    ensurePreviewStyles();
    try {
      this.catalog = await catalog();
      this.tab = readTab(this.catalog.tabs);
    } catch {
      this.error = true;
    }
  }

  private pick(t: StoreTabChoice): void {
    this.tab = t;
    writeTab(t);
  }

  private wear(name: string | null): void {
    wearSkin(name);
    this.worn = wornSkin();
  }

  private setNukeStyle(name: string | null): void {
    const theme = DERPY_FX_THEMES.find((t) => t.name === name) ?? null;
    storeEffectSlots(withNukeStyle(storedEffectSlots(), theme));
    this.nukeStyle = nukeStyleIn(storedEffectSlots());
  }

  private setDomeStyle(name: string | null): void {
    wearDomeStyle(name);
    this.domeStyle = wornDomeStyle();
  }

  /** DLC (r21): the map style Derpy Conquest draws (if your account owns it). */
  private setMapStyle(name: string | null): void {
    const key = name?.replace(/^map_/, "") ?? null;
    chooseMapStyle(
      key && (MAP_STYLES as readonly string[]).includes(key)
        ? (key as MapStyleKey)
        : null,
    );
    this.mapStyle = chosenMapStyle() ? `map_${chosenMapStyle()}` : null;
  }

  private setFanfare(name: FanfareName | null): void {
    chooseFanfare(name);
    this.fanfare = chosenFanfare();
    if (name !== null) listen(name);
  }

  render(): TemplateResult {
    return html`
      <header class="dl-pagehead">
        <span class="dl-pageicon">${chestIcon()}</span>
        <div>
          <h1 class="dl-h1">Inventory</h1>
          <p class="dl-lede">
            What you own from the Derp Store, and what you use. Everyone in a
            game sees your skin and effects. Flags and free patterns are in
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
        <p>Sign in to see what you own.</p>
        <button class="dl-btn" @click=${() => openSignIn()}>Sign in</button>
      </div>`;
    }
    if (this.error)
      return html`<p class="dl-panel dl-quiet">
        Couldn't load your things. Refresh to try again.
      </p>`;
    if (this.catalog === null || this.account === null || this.tab === null)
      return html`<p class="dl-quiet">Loading…</p>`;
    const cat = this.catalog;
    const owned = this.account.owned;
    const tab = this.tab;
    const mine = ownedInTab(cat.items, owned, tab);
    return html`
      ${tabBar(cat.tabs, tab, tabCounts(cat.items, cat.tabs, owned), (t) =>
        this.pick(t),
      )}
      <p class="dl-tabblurb">${blurbOf(cat.tabs, tab)}</p>
      ${mine.length === 0
        ? this.renderNone(cat, tab)
        : this.renderOwned(tab, mine)}
    `;
  }

  private renderNone(cat: StoreCatalog, tab: StoreTabChoice): TemplateResult {
    const forSale = itemsInTab(cat.items, tab);
    return html`<div class="dl-panel dl-empty with-mascot">
      ${bananaMark("dl-banana mid")}
      <div>
        <p>
          ${forSale.length === 0
            ? `Nothing here yet. ${labelOf(cat.tabs, tab)} are on their way to the store.`
            : `None of these yet. They start at ${nf(Math.min(...forSale.map((i) => i.price)))} Derp Coins, and every game you finish signed in earns some.`}
        </p>
        ${forSale.length > 0
          ? html`<a class="dl-btn" href=${`/store${tabHash(tab)}`}
              >Go to the Store</a
            >`
          : nothing}
      </div>
    </div>`;
  }

  private renderOwned(tab: StoreTabChoice, mine: StoreItem[]): TemplateResult {
    switch (tab.category) {
      case "skins":
        return this.renderSkins(mine);
      case "personalities":
        return html`<p class="dl-quiet dl-howto">
            Pick these in DerpyFront when you host a lobby or play Solo, under
            <b>AI personalities</b>. The AI nations then play them.
          </p>
          <div class="dl-packs">
            ${mine.map(
              (i) =>
                html`<article class="dl-pack" data-item=${i.name}>
                  <h2 class="dl-pack-name">${i.displayName}</h2>
                  <ul class="dfx-personas dl-itembody">
                    ${(i.personas ?? []).map((p) => personaCard(p))}
                  </ul>
                </article>`,
            )}
          </div>`;
      case "effects":
        return html`
          <h2 class="dl-h2 dl-pickhead">Your nukes</h2>
          ${this.picker(
            mine,
            this.nukeStyle,
            (n) => this.setNukeStyle(n),
            "The usual look",
          )}
          <h2 class="dl-h2 dl-pickhead">Your Domes</h2>
          ${this.picker(
            mine,
            this.domeStyle,
            (n) => this.setDomeStyle(n),
            "The usual shield",
          )}
        `;
      case "fanfares":
        return this.picker(
          mine,
          this.fanfare,
          (n) => this.setFanfare(n !== null && isFanfare(n) ? n : null),
          "The usual victory sound",
          true,
        );
      // DLC (r21): Derpy Conquest's map styles, chosen here or in the game.
      case "mapstyles":
        return html`<h2 class="dl-h2 dl-pickhead">
            Your map in Derpy Conquest
          </h2>
          ${this.picker(
            mine,
            this.mapStyle,
            (n) => this.setMapStyle(n),
            "The usual chart",
          )}
          <p class="dl-quiet dl-howto">
            Only you see your map style. You can change it in Derpy Conquest too
            (menu › Settings › Map style).
          </p>`;
      default:
        return html`<div class="dl-packs">
          ${mine.map(
            (i) =>
              html`<article class="dl-pack" data-item=${i.name}>
                <h2 class="dl-pack-name">${i.displayName}</h2>
                <p class="dl-pack-desc">${i.description}</p>
                ${i.conquest
                  ? html`<p class="dl-howto">
                        <b>How to use it:</b> ${i.conquest.howTo}
                      </p>
                      <a class="dl-btn ghost" href="/conquest"
                        >Play Derpy Conquest</a
                      >`
                  : nothing}
              </article>`,
          )}
        </div>`;
    }
  }

  /** Tiles to choose one of `items` (or none) for something you use. */
  private picker(
    items: StoreItem[],
    current: string | null,
    choose: (name: string | null) => void,
    noneLabel: string,
    listenable = false,
  ): TemplateResult {
    const tile = (name: string | null, label: string, img: TemplateResult) => {
      const on = current === name;
      return html`<li>
        <button
          class="dl-skin ${on ? "on" : ""}"
          aria-pressed=${on}
          @click=${() => choose(name)}
        >
          ${img}
          <span class="dl-skin-name">${label}</span>
          <span class="dl-skin-state">${on ? "In use" : "Use"}</span>
        </button>
      </li>`;
    };
    return html`<ul class="dl-locker">
        ${tile(
          null,
          noneLabel,
          html`<span
            class="dl-skin-none ${items.some(
              (i) => !!i.fx || !!i.conquest?.palette,
            )
              ? "wide"
              : ""}"
            aria-hidden="true"
          ></span>`,
        )}
        ${items.map((i) =>
          tile(
            i.name,
            i.displayName,
            i.fx
              ? html`<span class="dl-pickart"
                  >${fxPreview(`inv_${i.name}`, i.fx)}</span
                >`
              : i.conquest?.palette // DLC (r21): a map style's corner of the chart
                ? html`<span class="dl-pickart"
                    >${mapStylePreview(
                      `inv_${i.name}`,
                      i.name.replace(/^map_/, ""),
                      i.conquest.palette,
                    )}</span
                  >`
                : html`<span class="dl-skin-none dl-music" aria-hidden="true"
                    >♪</span
                  >`,
          ),
        )}
      </ul>
      ${listenable
        ? html`<p class="dl-quiet dl-howto">
            Choosing one plays it. It plays when you win a DerpyFront game, at
            your music volume.
          </p>`
        : nothing}`;
  }

  private renderSkins(mine: StoreItem[]): TemplateResult {
    const owned = mine.flatMap((p) =>
      (p.skins ?? [])
        .filter((s) => this.account!.owned.includes(`skin:${s.name}`))
        .map((s) => ({ ...s, pack: p.displayName })),
    );
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
