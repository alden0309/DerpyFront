import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { translateText } from "../Utils";

/**
 * Where this copy's source code lives. OpenFront is AGPL-3.0, which requires
 * a hosted, modified copy to offer its players the source, so this one small
 * link stays in the footer.
 */
export const SOURCE_CODE_URL =
  "https://github.com/alden0309/DerpyFront/tree/capital-mod";

/** The credits under "Hey Buddy". */
export const CREDITS = [
  "Made by: Alden",
  "Taped by Michael",
  "Robert'd by Gary",
] as const;

/**
 * Derpy Front's footer: a big "Hey Buddy" in the middle, the credits and the
 * Terms of Service, Privacy Policy, source link and OpenFront copyright under
 * it, and the language button on the right.
 */
@customElement("page-footer")
export class Footer extends LitElement {
  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <footer
        class="[.in-game_&]:hidden bg-zinc-900/90 backdrop-blur-md flex flex-col items-center justify-center gap-1 pt-4 pb-3 text-white/50 w-full border-t border-white/10 shrink-0 relative z-50"
      >
        <p
          class="hey-buddy m-0 mb-8 lg:mb-12 text-center text-4xl lg:text-5xl font-extrabold tracking-wide text-white"
        >
          Hey Buddy
        </p>
        <p
          class="footer-credits m-0 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 px-4 text-sm font-semibold text-white/80"
        >
          ${CREDITS.map(
            (line, i) =>
              html`${i > 0
                  ? html`<span class="text-white/30" aria-hidden="true"
                      >•</span
                    >`
                  : ""}<span>${line}</span>`,
          )}
        </p>
        <div class="text-xs mt-1 flex items-center justify-center gap-4 px-4">
          <a
            href="/terms-of-service.html"
            data-i18n="main.terms_of_service"
            target="_blank"
            class="hover:text-white transition-colors"
          ></a>
          <a
            href="/privacy-policy.html"
            data-i18n="main.privacy_policy"
            target="_blank"
            class="hover:text-white transition-colors"
          ></a>
          <a
            href=${SOURCE_CODE_URL}
            target="_blank"
            rel="noopener noreferrer"
            class="footer-source text-white/30 hover:text-white transition-colors"
            title="Derpy Front is a modified copy of OpenFront (AGPL-3.0)"
            >Source</a
          >
          <!-- OpenFront's license (AGPL-3.0 section 7 terms) requires this
               notice somewhere reasonably visible, such as the main menu. -->
          <span class="footer-copyright text-white/30"
            >${translateText("main.copyright")}</span
          >
        </div>

        <!-- Single instance: translateText() resolves the active language via
             document.querySelector("lang-selector"), so a second one would
             shadow it. -->
        <lang-selector
          class="absolute right-4 top-1/2 -translate-y-1/2"
        ></lang-selector>
      </footer>
    `;
  }
}
