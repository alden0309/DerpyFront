// BASED (r19): Mr. Based on the Derp Land home. A wide, dark card under the
// two games: Coming Soon for everyone, except the account allowed to play,
// for whom it's the way in. Only the public teaser is in here.

import { html, LitElement, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import * as BasedApi from "../based/client/Api";
import {
  BASED_BOX,
  BASED_FACTS,
  BASED_TAGLINE,
  BASED_TEASER,
  BASED_TITLE,
} from "../based/client/Teaser";
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
        <span class="dl-based-tag">${BASED_TAGLINE}</span>
        <span class="dl-based-pitch">${BASED_TEASER[0]}</span>
        <span class="dl-based-facts">
          ${BASED_FACTS.map((f) => html`<span>${f}</span>`)}
        </span>
        <span class="dl-based-cta"
          >${this.play ? "Play Mr. Based" : "Coming soon"}</span
        >
      </span>
    </a>`;
  }
}
