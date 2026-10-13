// BASED (r19): Mr. Based on the Derp Land home. A wide, dark card under the
// two games: only its title and "Coming soon" for everyone, except the
// account allowed to play, for whom it's the way in.

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import * as BasedApi from "../based/client/Api";
import { BASED_BOX, BASED_TITLE } from "../based/client/Teaser";
import { DERPY_ACCOUNT_EVENT } from "../derpland/Account";
import "./based-card.css";

@customElement("dl-based-card")
export class DerpBasedCard extends LitElement {
  @state() private play = false;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(DERPY_ACCOUNT_EVENT, this.refresh);
    this.refresh();
  }

  disconnectedCallback(): void {
    window.removeEventListener(DERPY_ACCOUNT_EVENT, this.refresh);
    super.disconnectedCallback();
  }

  private refresh = () => {
    void BasedApi.access().then((a) => (this.play = a.play));
  };

  render(): TemplateResult {
    return html`<a class="dl-based ${this.play ? "open" : ""}" href="/based">
      <span class="dl-based-art">
        <img src=${BASED_BOX} alt="" width="1200" height="750" loading="lazy" />
      </span>
      <span class="dl-based-body">
        <span class="dl-based-stamp"
          >${this.play ? "Early access" : "Coming soon"}</span
        >
        <span class="dl-based-title">${BASED_TITLE}</span>
        ${this.play
          ? html`<span class="dl-based-cta">Play Mr. Based</span>`
          : nothing}
      </span>
    </a>`;
  }
}
