// ADMIN (r26): what each admin section's page element shares: the view it's
// given, loading its data when its address changes, and a plain line when
// that fails. Light DOM, so the hub's and the admin's styles apply.

import { html, LitElement, TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import { AdminError, type AdminView } from "./Registry";
import { errorText } from "./ui";

export abstract class AdminPage extends LitElement {
  @property({ attribute: false }) view!: AdminView;
  @state() protected error: string | null = null;
  @state() protected busy = false;
  private loadedFor: string | null = null;

  createRenderRoot() {
    return this;
  }

  /** What, of the address, the data depends on (it's fetched again when this changes). */
  protected loadKey(): string {
    return `${this.view.path.join("/")}?${this.view.query.toString()}`;
  }

  /** Fetch the page's data. */
  protected abstract fetch(): Promise<void>;

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (!changed.has("view") || !this.view) return;
    const key = this.loadKey();
    if (key === this.loadedFor) return;
    this.loadedFor = key;
    void this.reload();
  }

  async reload(): Promise<void> {
    try {
      await this.fetch();
      this.error = null;
    } catch (err) {
      this.error =
        err instanceof AdminError ? errorText(err.code) : String(err);
    }
  }

  /**
   * Runs a change: busy while it's on its way, its error as a note, then
   * the page's data again. Resolves to what it returned, or null.
   */
  protected async act<T>(
    fn: () => Promise<T>,
    done?: string,
  ): Promise<T | null> {
    this.busy = true;
    try {
      const out = await fn();
      if (done) this.view.toast(done, "good");
      await this.reload();
      return out;
    } catch (err) {
      this.view.toast(
        err instanceof AdminError ? errorText(err.code) : String(err),
        "bad",
      );
      return null;
    } finally {
      this.busy = false;
    }
  }

  protected failed(): TemplateResult {
    return html`<div class="adm-badline">${this.error}</div>`;
  }
}
