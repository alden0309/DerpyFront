import { assetUrl } from "@openfront/shared/AssetUrls";
import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import "../../derpland/DerpBar";
import { BarLabels } from "../../derpland/DerpBar";
import { NAV_TAGLINE } from "../GameVersion";
import { translateText } from "../Utils";
import "./NavUtilityIcons";

/** The shared bar's words in the player's language. */
function barLabels(): Partial<BarLabels> {
  const t = (key: string) => translateText(key);
  return {
    play: t("main.play"),
    store: t("main.store"),
    inventory: t("main.inventory"),
    leaderboard: t("main.leaderboard"),
    signIn: t("derpy.sign_in"),
    newAccount: t("derp_bar.new_account"),
    makeAccount: t("derp_bar.make_account"),
    makeMyAccount: t("derp_bar.make_my_account"),
    signOut: t("derpy.sign_out"),
    yourAccount: t("derpy.account_title"),
    yourStats: t("derp_bar.your_stats"),
    yourSkins: t("derp_bar.your_skins"),
    yourCoins: t("derp_bar.your_coins"),
    derpCoins: t("derpy.derp_coins"),
    frontBlurb: t("derp_bar.front_blurb"),
    conquestBlurb: t("derp_bar.conquest_blurb"),
    dialogBlurb: t("derp_bar.dialog_blurb"),
    username: t("derpy.username"),
    password: t("derpy.password"),
    rules: t("derpy.username_rules"),
    close: t("common.close"),
    errors: {
      invalid_username: t("derpy.error_invalid_username"),
      invalid_password: t("derpy.error_invalid_password"),
      username_taken: t("derpy.error_username_taken"),
      wrong_password: t("derpy.error_wrong_password"),
      accounts_unavailable: t("derpy.error_accounts_unavailable"),
      server_error: t("derpy.error_server_error"),
    },
  };
}

/**
 * DerpyFront's top bar: the same Derp Land bar every page on the site has
 * (Play, Store, Inventory, Leaderboard and your account), with DerpyFront's
 * logo and tagline beside the Derp Land mark, and its news, help and
 * settings buttons beside the account.
 */
@customElement("desktop-nav-bar")
export class DesktopNavBar extends LitElement {
  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <derp-bar page="derpyfront" has-tools .labels=${barLabels()}>
        <div
          slot="brand"
          class="derpyfront-brand flex flex-col items-start justify-center gap-0.5"
        >
          <img
            class="block h-5 lg:h-6 w-auto aspect-[314/48]"
            src=${assetUrl("images/OpenFrontLogo.svg")}
            alt="DerpyFront"
          />
          <div
            id="game-version"
            class="l-header__highlightText text-xs lg:text-sm leading-tight whitespace-nowrap"
          >
            ${NAV_TAGLINE}
          </div>
        </div>
        <nav-utility-icons slot="tools" size="desktop"></nav-utility-icons>
      </derp-bar>
    `;
  }
}
