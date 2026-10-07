import { html, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseModal } from "../components/BaseModal";
import { modalHeader } from "../components/ui/ModalHeader";
import { UserSettings } from "../UserSettings";
import { translateText } from "../Utils";
import {
  DERPY_ACCOUNT_EVENT,
  DerpyApiError,
  derpyBuyPack,
  DerpyMe,
  derpyMe,
  DerpyPack,
  DerpySkin,
  derpyStore,
  isDerpySignedIn,
} from "./DerpyAccount";
import { coinAmount, derpCoinIcon } from "./DerpyUi";

function packName(p: DerpyPack): string {
  return translateText(`derpy.pack_${p.name}`);
}

function skinName(s: DerpySkin): string {
  // The inventory names skins from the same keys.
  return translateText(`territory_patterns.pattern.${s.name}`);
}

/**
 * The Derp Store: skin packs bought with Derp Coins, and the skins you own,
 * ready to wear.
 */
@customElement("derpy-store-page")
export class DerpyStorePage extends BaseModal {
  protected routerName = "store";

  @state() private packs: DerpyPack[] | null = null;
  @state() private me: DerpyMe | null = null;
  @state() private equipped: string | null = null;
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
    this.message = null;
    this.equipped = this.settings.getSelectedSkinName();
    void this.load();
  }

  /** Catch up on coins and purchases (Main calls this on returning home). */
  public refresh(): void {
    if (this.isModalOpen) void this.refreshMe();
  }

  private async load(): Promise<void> {
    this.error = null;
    try {
      this.packs = (await derpyStore()).packs;
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
    if (this.equipped !== null && !this.owns(`skin:${this.equipped}`)) {
      this.equip(null);
    }
  }

  private owns(item: string): boolean {
    return this.me?.owned.includes(item) ?? false;
  }

  private equip(name: string | null): void {
    this.settings.setSelectedPatternName(
      name === null ? undefined : `skin:${name}`,
    );
    this.equipped = name;
  }

  private async buy(pack: DerpyPack): Promise<void> {
    this.buying = pack.name;
    this.message = null;
    try {
      const result = await derpyBuyPack(pack.name);
      this.me = this.me
        ? { ...this.me, coins: result.coins, owned: result.owned }
        : null;
      this.message = translateText("derpy.bought_pack", {
        pack: packName(pack),
      });
      if (this.equipped === null && pack.skins.length > 0) {
        this.equip(pack.skins[0].name);
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
    if (this.packs === null) {
      return html`<p class="p-6 text-center text-white/50">
        ${translateText("derpy.loading")}
      </p>`;
    }
    const ownedSkins = this.packs
      .flatMap((p) => p.skins)
      .filter((s) => this.owns(`skin:${s.name}`));
    return html`
      <div class="flex flex-col gap-6 p-4 lg:p-6">
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
        ${this.message
          ? html`<p
              role="status"
              class="m-0 rounded-lg bg-white/10 px-4 py-2 text-sm text-white"
            >
              ${this.message}
            </p>`
          : ""}
        ${ownedSkins.length > 0 ? this.renderLocker(ownedSkins) : ""}
        <div class="flex flex-col gap-4">
          ${this.packs.map((p) => this.renderPack(p))}
        </div>
      </div>
    `;
  }

  private renderLocker(skins: DerpySkin[]): TemplateResult {
    return html`<section class="flex flex-col gap-3">
      <h3 class="m-0 text-lg font-bold text-white">
        ${translateText("derpy.your_skins")}
      </h3>
      <p class="m-0 text-sm text-white/55">
        ${translateText("derpy.your_skins_blurb")}
      </p>
      <div class="flex flex-wrap gap-3">
        <button
          class="flex w-28 flex-col items-center gap-2 rounded-xl border p-2 text-xs font-semibold transition-colors ${this
            .equipped === null
            ? "border-cyber-yellow bg-cyber-yellow/10 text-white"
            : "border-white/10 bg-white/5 text-white/70 hover:border-white/30"}"
          @click=${() => this.equip(null)}
        >
          <span
            class="flex aspect-square w-full items-center justify-center rounded-lg bg-black/30 text-2xl text-white/30"
            >∅</span
          >
          ${translateText("derpy.no_skin")}
        </button>
        ${skins.map(
          (s) =>
            html`<button
              class="flex w-28 flex-col items-center gap-2 rounded-xl border p-2 text-xs font-semibold transition-colors ${this
                .equipped === s.name
                ? "border-cyber-yellow bg-cyber-yellow/10 text-white"
                : "border-white/10 bg-white/5 text-white/70 hover:border-white/30"}"
              @click=${() => this.equip(s.name)}
              aria-pressed=${this.equipped === s.name}
            >
              <img
                src=${s.url}
                alt=""
                loading="lazy"
                class="aspect-square w-full rounded-lg bg-black/30 object-cover"
              />
              ${skinName(s)}
              <span class="text-[10px] uppercase tracking-wide text-white/40"
                >${this.equipped === s.name
                  ? translateText("derpy.equipped")
                  : translateText("derpy.equip")}</span
              >
            </button>`,
        )}
      </div>
    </section>`;
  }

  private renderPack(p: DerpyPack): TemplateResult {
    const owned = this.owns(`pack:${p.name}`);
    const signedIn = this.me !== null;
    const short = signedIn ? Math.max(0, p.price - this.me!.coins) : 0;
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
        @click=${() => this.buy(p)}
      >
        ${short > 0
          ? translateText("derpy.need_more", { coins: short.toLocaleString() })
          : translateText("derpy.buy_for", {
              coins: p.price.toLocaleString(),
            })}
      </button>`;
    }
    return html`<article
      class="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5"
    >
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 flex-1 flex-col">
          <h3 class="m-0 text-xl font-black text-white">${packName(p)}</h3>
          <p class="m-0 text-sm text-white/55">
            ${translateText(`derpy.pack_desc_${p.name}`)}
          </p>
        </div>
        <div class="flex items-center gap-3">
          ${owned ? "" : coinAmount(p.price, "text-lg")} ${button}
        </div>
      </header>
      <div class="grid grid-cols-3 gap-3 sm:grid-cols-5">
        ${p.skins.map(
          (s) =>
            html`<figure class="m-0 flex flex-col items-center gap-1.5">
              <img
                src=${s.url}
                alt=${skinName(s)}
                loading="lazy"
                class="aspect-square w-full rounded-lg bg-black/30 object-cover"
              />
              <figcaption
                class="text-center text-xs leading-tight text-white/65"
              >
                ${skinName(s)}
              </figcaption>
            </figure>`,
        )}
      </div>
    </article>`;
  }
}
