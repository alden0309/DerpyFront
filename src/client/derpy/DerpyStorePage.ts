import { DERPY_FX_THEMES } from "@openfront/shared/DerpyFx";
import { html, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  ensurePreviewStyles,
  fxPreview,
  mapStylePreview,
  skinArt,
} from "../../derpland/StorePreviews";
import {
  itemsInTab,
  ownedInTab,
  ownsItem,
  StoreTabChoice,
  tabCounts,
  tabKey,
} from "../../derpland/StoreTabs";
import { BaseModal } from "../components/BaseModal";
import { modalHeader } from "../components/ui/ModalHeader";
import { UserSettings } from "../UserSettings";
import { translateText } from "../Utils";
import {
  AI_CHOICE_BADGE,
  AI_CHOICE_ICON,
  aiChoiceName,
  aiTypeOf,
} from "./AiPersonalityLabels";
import {
  DERPY_ACCOUNT_EVENT,
  DerpyApiError,
  derpyBuyPack,
  DerpyMe,
  derpyMe,
  DerpySkin,
  derpyStore,
  DerpyStoreItem,
  DerpyStoreTab,
  isDerpySignedIn,
} from "./DerpyAccount";
import {
  nukeStyleIn,
  wearDomeStyle,
  withNukeStyle,
  wornDomeStyle,
} from "./DerpyLooks";
import { coinAmount, derpCoinIcon } from "./DerpyUi";
import {
  chooseFanfare,
  chosenFanfare,
  FanfareName,
  FanfarePlayback,
  isFanfare,
  playFanfare,
} from "./Fanfares";

/** A translation, or the catalog's own English when there's no key for it. */
function tr(key: string, fallback: string): string {
  const t = translateText(key);
  return t === key || t.startsWith("derpy.") ? fallback : t;
}

function itemName(i: DerpyStoreItem): string {
  const packKey = `derpy.pack_${i.name}`;
  const itemKey = `derpy.item_${i.name}`;
  return tr(i.category === "skins" ? packKey : itemKey, i.displayName);
}

function itemDesc(i: DerpyStoreItem): string {
  const packDescKey = `derpy.pack_desc_${i.name}`;
  const itemDescKey = `derpy.item_desc_${i.name}`;
  return tr(i.category === "skins" ? packDescKey : itemDescKey, i.description);
}

function skinName(s: DerpySkin): string {
  // The inventory names skins from the same keys.
  return tr(`territory_patterns.pattern.${s.name}`, s.displayName);
}

let preview: FanfarePlayback | null = null;
function listen(name: string): void {
  if (!isFanfare(name)) return;
  preview?.stop();
  const s = new UserSettings();
  // Store previews follow the music slider (and master), like the fanfare.
  const v = s.audioVolume("master") ** 2 * s.audioVolume("music") ** 2;
  preview = playFanfare(name, { volume: Math.max(0.15, v) });
}

const CHIP_ON = "border-cyber-yellow bg-cyber-yellow/10 text-white" as const;
const CHIP_OFF =
  "border-white/10 bg-white/5 text-white/70 hover:border-white/30" as const;

/**
 * The Derp Store: everything bought with Derp Coins, under tabs by game and
 * category (DFSTORE r21), and what you own of each, ready to use.
 */
@customElement("derpy-store-page")
export class DerpyStorePage extends BaseModal {
  protected routerName = "store";

  @state() private items: DerpyStoreItem[] | null = null;
  @state() private tabs: DerpyStoreTab[] = [];
  @state() private tab: StoreTabChoice = {
    game: "derpyfront",
    category: "skins",
  };
  @state() private me: DerpyMe | null = null;
  @state() private equipped: string | null = null;
  @state() private nukeStyle: string | null = null;
  @state() private domeStyle: string | null = null;
  @state() private fanfare: FanfareName | null = null;
  @state() private buying: string | null = null;
  @state() private message: string | null = null;
  @state() private error: string | null = null;

  private settings = new UserSettings();

  private onAccountChanged = () => void this.refreshMe();

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(DERPY_ACCOUNT_EVENT, this.onAccountChanged);
  }

  disconnectedCallback(): void {
    window.removeEventListener(DERPY_ACCOUNT_EVENT, this.onAccountChanged);
    super.disconnectedCallback();
  }

  protected onOpen(): void {
    ensurePreviewStyles();
    this.message = null;
    this.equipped = this.settings.getSelectedSkinName();
    this.nukeStyle = nukeStyleIn(this.settings.getSelectedEffects());
    this.domeStyle = wornDomeStyle();
    this.fanfare = chosenFanfare();
    void this.load();
  }

  /** Catch up on coins and purchases (Main calls this on returning home). */
  public refresh(): void {
    if (this.isModalOpen) void this.refreshMe();
  }

  private async load(): Promise<void> {
    this.error = null;
    try {
      const store = await derpyStore();
      // A server from before r21 sends only the skin packs.
      this.items =
        store.items ??
        store.packs.map((p) => ({
          ...p,
          game: "derpyfront",
          category: "skins",
        }));
      this.tabs = store.tabs ?? [
        {
          game: "derpyfront",
          label: "DerpyFront",
          categories: [{ id: "skins", label: "Skins", blurb: "" }],
        },
      ];
    } catch (err) {
      this.error =
        err instanceof DerpyApiError && err.code === "accounts_unavailable"
          ? translateText("derpy.accounts_unavailable")
          : translateText("derpy.load_failed");
    }
    await this.refreshMe();
  }

  private async refreshMe(): Promise<void> {
    this.me = await derpyMe();
    // A skin you no longer own (signed out, another account) comes off.
    if (
      this.equipped !== null &&
      !this.owned().includes(`skin:${this.equipped}`)
    ) {
      this.equip(null);
    }
  }

  private owned(): string[] {
    return this.me?.owned ?? [];
  }

  private equip(name: string | null): void {
    this.settings.setSelectedPatternName(
      name === null ? undefined : `skin:${name}`,
    );
    this.equipped = name;
  }

  private setNukeStyle(name: string | null): void {
    const theme = DERPY_FX_THEMES.find((t) => t.name === name) ?? null;
    const before = this.settings.getSelectedEffects();
    const after = withNukeStyle(before, theme);
    for (const slot of new Set([
      ...Object.keys(before),
      ...Object.keys(after),
    ])) {
      if (before[slot] !== after[slot]) {
        this.settings.setSelectedEffectName(slot, after[slot]);
      }
    }
    this.nukeStyle = nukeStyleIn(this.settings.getSelectedEffects());
  }

  private setDomeStyle(name: string | null): void {
    wearDomeStyle(name);
    this.domeStyle = wornDomeStyle();
  }

  private setFanfare(name: string | null): void {
    const f = name !== null && isFanfare(name) ? name : null;
    chooseFanfare(f);
    this.fanfare = chosenFanfare();
    if (f !== null) listen(f);
  }

  private async buy(item: DerpyStoreItem): Promise<void> {
    this.buying = item.name;
    this.message = null;
    try {
      const result = await derpyBuyPack(item.name);
      this.me = this.me
        ? { ...this.me, coins: result.coins, owned: result.owned }
        : null;
      this.message = translateText("derpy.bought_item", {
        item: itemName(item),
      });
      // Something new to use straight away, if nothing of its kind is on.
      if (item.skins && this.equipped === null && item.skins.length > 0) {
        this.equip(item.skins[0].name);
      }
      if (item.fx) {
        if (this.nukeStyle === null) this.setNukeStyle(item.name);
        if (this.domeStyle === null) this.setDomeStyle(item.name);
      }
      if (item.fanfare && this.fanfare === null) {
        chooseFanfare(isFanfare(item.name) ? item.name : null);
        this.fanfare = chosenFanfare();
      }
    } catch (err) {
      this.message =
        err instanceof DerpyApiError && err.code === "not_enough_coins"
          ? translateText("derpy.not_enough_coins")
          : translateText("derpy.buy_failed");
    } finally {
      this.buying = null;
    }
  }

  protected renderHeaderSlot(): TemplateResult {
    return modalHeader({
      title: translateText("derpy.store_title"),
      onBack: () => this.close(),
      ariaLabel: translateText("common.close"),
      rightContent: this.me ? coinAmount(this.me.coins, "text-lg") : undefined,
    });
  }

  protected renderBody(): TemplateResult {
    if (this.error) {
      return html`<p class="p-6 text-center text-white/60">${this.error}</p>`;
    }
    if (this.items === null) {
      return html`<p class="p-6 text-center text-white/50">
        ${translateText("derpy.loading")}
      </p>`;
    }
    const items = itemsInTab(this.items, this.tab);
    const mine = ownedInTab(this.items, this.owned(), this.tab);
    return html`
      <div class="flex flex-col gap-5 p-4 lg:p-6">
        <div
          class="flex items-start gap-3 rounded-xl border border-cyber-yellow/25 bg-cyber-yellow/10 p-4"
        >
          ${derpCoinIcon("w-8 h-8 mt-0.5")}
          <p class="m-0 text-sm leading-relaxed text-white/80">
            ${translateText("derpy.coins_explainer")}
            ${isDerpySignedIn()
              ? ""
              : html`<button
                  class="ml-1 cursor-pointer font-bold text-cyber-yellow underline"
                  @click=${() => window.showPage?.("page-account")}
                >
                  ${translateText("derpy.sign_in_to_earn")}
                </button>`}
          </p>
        </div>
        ${this.renderTabs()}
        <p class="m-0 -mt-2 text-sm text-white/55">
          ${translateText(`derpy.store_blurb_${this.tab.category}`)}
        </p>
        ${this.message
          ? html`<p
              role="status"
              class="m-0 rounded-lg bg-white/10 px-4 py-2 text-sm text-white"
            >
              ${this.message}
            </p>`
          : ""}
        ${mine.length > 0 ? this.renderYours(mine) : ""}
        ${items.length === 0
          ? html`<p
              class="m-0 rounded-xl border border-dashed border-white/15 p-6 text-center text-white/55"
            >
              ${translateText("derpy.store_nothing_yet")}
            </p>`
          : html`<div class="flex flex-col gap-4">
              ${items.map((i) => this.renderItem(i))}
            </div>`}
      </div>
    `;
  }

  private renderTabs(): TemplateResult {
    const counts = tabCounts(this.items ?? [], this.tabs);
    const game =
      this.tabs.find((t) => t.game === this.tab.game) ?? this.tabs[0];
    return html`<nav class="flex min-w-0 flex-col gap-3">
      <div class="flex gap-2" role="tablist">
        ${this.tabs.map(
          (t) =>
            html`<button
              role="tab"
              aria-selected=${t.game === this.tab.game}
              class="rounded-lg px-4 py-2 text-sm font-black uppercase tracking-wide transition-colors ${t.game ===
              this.tab.game
                ? "bg-white text-zinc-900"
                : "bg-white/5 text-white/70 hover:bg-white/10"}"
              @click=${() => {
                this.tab = {
                  game: t.game,
                  category: t.categories[0]?.id ?? "",
                };
              }}
            >
              ${translateText(`derpy.store_game_${t.game}`)}
            </button>`,
        )}
      </div>
      <div
        class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]"
        role="tablist"
      >
        ${game?.categories.map((c) => {
          const on = c.id === this.tab.category;
          const n =
            counts.get(tabKey({ game: game.game, category: c.id })) ?? 0;
          return html`<button
            role="tab"
            aria-selected=${on}
            class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-bold transition-colors ${on
              ? CHIP_ON
              : CHIP_OFF}"
            @click=${() => {
              this.tab = { game: game.game, category: c.id };
            }}
          >
            ${translateText(`derpy.store_cat_${c.id}`)}
            <span
              class="rounded-full px-1.5 text-[11px] tabular-nums ${on
                ? "bg-cyber-yellow text-zinc-900"
                : "bg-white/10 text-white/50"}"
              >${n}</span
            >
          </button>`;
        })}
      </div>
    </nav>`;
  }

  /** What you own under this tab, and which one you use. */
  private renderYours(mine: DerpyStoreItem[]): TemplateResult {
    const head = (key: string, blurb?: string) =>
      html`<h3 class="m-0 text-lg font-bold text-white">
          ${translateText(key)}
        </h3>
        ${blurb
          ? html`<p class="m-0 text-sm text-white/55">
              ${translateText(blurb)}
            </p>`
          : ""}`;
    switch (this.tab.category) {
      case "skins": {
        const skins = mine
          .flatMap((p) => p.skins ?? [])
          .filter((s) => this.owned().includes(`skin:${s.name}`));
        return html`<section class="flex flex-col gap-3">
          ${head("derpy.your_skins", "derpy.your_skins_blurb")}
          ${this.choices(
            this.equipped,
            (n) => this.equip(n),
            translateText("derpy.no_skin"),
            skins.map((s) => ({
              name: s.name,
              label: skinName(s),
              art: skinArt(s, {
                cls: "aspect-square w-full rounded-lg bg-black/30 object-cover",
                moves: translateText("derpy.skin_moves"),
                hint: (m) => translateText(`derpy.skin_motion_${m}`),
              }),
            })),
          )}
        </section>`;
      }
      case "effects": {
        const fx = mine.map((i) => ({
          name: i.name,
          label: itemName(i),
          art: i.fx ? fxPreview(`mine_${i.name}`, i.fx) : html``,
        }));
        return html`<section class="flex flex-col gap-3">
          ${head("derpy.your_nukes")}
          ${this.choices(
            this.nukeStyle,
            (n) => this.setNukeStyle(n),
            translateText("derpy.usual_nukes"),
            fx,
            "w-36",
          )}
          ${head("derpy.your_domes")}
          ${this.choices(
            this.domeStyle,
            (n) => this.setDomeStyle(n),
            translateText("derpy.usual_domes"),
            fx,
            "w-36",
          )}
        </section>`;
      }
      case "fanfares":
        return html`<section class="flex flex-col gap-3">
          ${head("derpy.your_fanfare", "derpy.your_fanfare_blurb")}
          ${this.choices(
            this.fanfare,
            (n) => this.setFanfare(n),
            translateText("derpy.usual_victory"),
            mine.map((i) => ({
              name: i.name,
              label: itemName(i),
              art: html`<span
                class="flex aspect-square w-full items-center justify-center rounded-lg bg-black/30 text-3xl text-cyber-yellow"
                >♪</span
              >`,
            })),
          )}
        </section>`;
      case "personalities":
        // AIP (r23): what you own, and where you tick it
        return html`<div
          class="flex flex-col gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm text-emerald-100"
        >
          <p class="m-0">${translateText("derpy.personalities_owned_howto")}</p>
          <div class="flex flex-wrap gap-2">
            ${mine.map((i) => {
              const t = aiTypeOf(i.aiType);
              return t === null
                ? ""
                : html`<span
                    class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${AI_CHOICE_BADGE[
                      t
                    ]}"
                    ><span aria-hidden="true">${AI_CHOICE_ICON[t]}</span
                    >${aiChoiceName(t)}</span
                  >`;
            })}
          </div>
        </div>`;
      default:
        return html``;
    }
  }

  /** One-of tiles: "none" first, then each choice; the chosen one lit. */
  private choices(
    current: string | null,
    choose: (name: string | null) => void,
    noneLabel: string,
    options: { name: string; label: string; art: TemplateResult }[],
    width = "w-28",
  ): TemplateResult {
    const tile = (name: string | null, label: string, art: TemplateResult) => {
      const on = current === name;
      return html`<button
        class="flex ${width} flex-col items-center gap-2 rounded-xl border p-2 text-xs font-semibold transition-colors ${on
          ? CHIP_ON
          : CHIP_OFF}"
        aria-pressed=${on}
        @click=${() => choose(name)}
      >
        ${art} ${label}
        <span class="text-[10px] uppercase tracking-wide text-white/40"
          >${this.tab.category === "skins"
            ? translateText(on ? "derpy.equipped" : "derpy.equip")
            : translateText(on ? "derpy.in_use" : "derpy.use")}</span
        >
      </button>`;
    };
    // The "none" tile takes the shape of the others' pictures.
    const wide = width !== "w-28";
    return html`<div class="flex flex-wrap gap-3">
      ${tile(
        null,
        noneLabel,
        html`<span
          class="flex ${wide
            ? "aspect-[8/3]"
            : "aspect-square"} w-full items-center justify-center rounded-lg bg-black/30 text-2xl text-white/30"
          >∅</span
        >`,
      )}
      ${options.map((o) => tile(o.name, o.label, o.art))}
    </div>`;
  }

  private renderItem(i: DerpyStoreItem): TemplateResult {
    const owned = ownsItem(this.owned(), i);
    const signedIn = this.me !== null;
    const short = signedIn ? Math.max(0, i.price - this.me!.coins) : 0;
    let button: TemplateResult;
    if (owned) {
      button = html`<span
        class="rounded-xl bg-emerald-500/15 px-4 py-2.5 text-center text-sm font-bold text-emerald-300"
        >${translateText("derpy.owned")}</span
      >`;
    } else if (!signedIn) {
      button = html`<button
        class="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/20"
        @click=${() => window.showPage?.("page-account")}
      >
        ${translateText("derpy.sign_in_to_buy")}
      </button>`;
    } else {
      button = html`<button
        class="flex items-center justify-center gap-2 rounded-xl bg-cyber-yellow px-4 py-2.5 text-sm font-black text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
        ?disabled=${short > 0 || this.buying !== null}
        @click=${() => this.buy(i)}
      >
        ${short > 0
          ? translateText("derpy.need_more", { coins: short.toLocaleString() })
          : translateText("derpy.buy_for", {
              coins: i.price.toLocaleString(),
            })}
      </button>`;
    }
    return html`<article
      class="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5"
      data-item=${i.name}
    >
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 flex-[1_1_16rem] flex-col">
          <h3 class="m-0 flex items-center gap-2 text-xl font-black text-white">
            ${this.personalityIcon(i)}${itemName(i)}
          </h3>
          <p class="m-0 text-sm text-white/55">${itemDesc(i)}</p>
        </div>
        <div class="flex items-center gap-3">
          ${owned ? "" : coinAmount(i.price, "text-lg")} ${button}
        </div>
      </header>
      ${this.renderItemBody(i)}
    </article>`;
  }

  /** AIP (r23): an AI personality's icon, before its name. */
  private personalityIcon(i: DerpyStoreItem): TemplateResult | typeof nothing {
    const t = aiTypeOf(i.aiType);
    if (t === null) return nothing;
    return html`<span
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xl ${AI_CHOICE_BADGE[
        t
      ]}"
      aria-hidden="true"
      >${AI_CHOICE_ICON[t]}</span
    >`;
  }

  private renderItemBody(i: DerpyStoreItem): TemplateResult | typeof nothing {
    if (i.skins) {
      return html`<div class="grid grid-cols-3 gap-3 sm:grid-cols-5">
        ${i.skins.map(
          (s) =>
            html`<figure class="m-0 flex w-full flex-col items-center gap-1.5">
              ${skinArt(s, {
                alt: skinName(s),
                cls: "aspect-square w-full rounded-lg bg-black/30 object-cover",
                moves: translateText("derpy.skin_moves"),
                hint: (m) => translateText(`derpy.skin_motion_${m}`),
              })}
              <figcaption
                class="text-center text-xs leading-tight text-white/65"
              >
                ${skinName(s)}
              </figcaption>
            </figure>`,
        )}
      </div>`;
    }
    if (i.fx) return fxPreview(i.name, i.fx);
    if (i.fanfare) {
      return html`<div class="flex flex-wrap items-center gap-3">
        <button
          class="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20"
          @click=${() => listen(i.name)}
        >
          <span aria-hidden="true">▶</span> ${translateText("derpy.listen")}
        </button>
        <span class="text-sm text-white/50"
          >${translateText("derpy.fanfare_seconds", {
            seconds: i.fanfare.seconds,
          })}</span
        >
      </div>`;
    }
    // DLC (r21): Derpy Conquest's items: a map style's corner of the chart,
    // and the way to the game they're for.
    if (i.conquest) {
      return html`<div class="flex flex-col gap-3">
        ${i.conquest.palette
          ? mapStylePreview(
              i.name,
              i.name.replace(/^map_/, ""),
              i.conquest.palette,
            )
          : nothing}
        <div class="flex flex-wrap items-center gap-3">
          <span class="text-sm text-white/55"
            >${translateText("derpy.conquest_item_note")}</span
          >
          <a
            class="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold text-white no-underline hover:bg-white/20"
            href="/conquest"
            >${translateText("derpy.conquest_item_play")}</a
          >
        </div>
      </div>`;
    }
    return nothing;
  }
}
