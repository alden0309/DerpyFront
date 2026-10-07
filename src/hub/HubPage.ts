// What every hub page shares: who's signed in (refreshed whenever the
// account changes) and light-DOM rendering so hub.css applies.

import { LitElement } from "lit";
import { state } from "lit/decorators.js";
import {
  DERPY_ACCOUNT_EVENT,
  derpyUsername,
  Me,
  me,
} from "../derpland/Account";

export abstract class HubPage extends LitElement {
  @state() protected username: string | null = derpyUsername();
  @state() protected account: Me | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(DERPY_ACCOUNT_EVENT, this.onAccount);
    void this.refreshAccount();
    void this.load();
  }

  disconnectedCallback(): void {
    window.removeEventListener(DERPY_ACCOUNT_EVENT, this.onAccount);
    super.disconnectedCallback();
  }

  private onAccount = () => {
    void this.refreshAccount();
    this.accountChanged();
  };

  protected async refreshAccount(): Promise<void> {
    this.username = derpyUsername();
    const m = await me();
    this.account = m;
    this.username = m?.username ?? derpyUsername();
  }

  /** Fetch the page's own data. */
  protected abstract load(): Promise<void>;

  /** Someone signed in or out, or coins changed. */
  protected accountChanged(): void {}
}
