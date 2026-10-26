// ADMIN (r26): the site banner on every page with the top bar. It arrives
// with what pages fetch anyway: the social beat (signed in, every 15 s) and
// What's New's list (signed out, once per page), so it costs no request of
// its own. A viewer can dismiss it; that's remembered in this browser for
// that banner (a new banner, or a changed one, shows again).

import type { SiteBanner } from "./BannerTypes";
import { news, NEWS_EVENT } from "./News";
import { social, SOCIAL_EVENT } from "./Social";

export const BANNER_EVENT = "derp-banner";
/** The banner version this browser dismissed. */
export const BANNER_DISMISSED_KEY = "derp_banner_dismissed";

function readDismissed(): number | null {
  try {
    const v = localStorage.getItem(BANNER_DISMISSED_KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

export class BannerClient {
  current: SiteBanner | null = null;
  private started = false;
  private lastSocial: unknown = null;
  private lastNews: unknown = null;
  /** Dismissed here when the browser can't keep it. */
  private dismissedHere: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  start(): void {
    if (this.started) return;
    this.started = true;
    window.addEventListener(SOCIAL_EVENT, this.onSocial);
    window.addEventListener(NEWS_EVENT, this.onNews);
    this.onSocial();
    this.onNews();
  }

  stop(): void {
    window.removeEventListener(SOCIAL_EVENT, this.onSocial);
    window.removeEventListener(NEWS_EVENT, this.onNews);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.started = false;
  }

  private onSocial = () => {
    const s = social.state;
    // Only a beat carries it (an action's answer doesn't).
    if (!s || s === this.lastSocial || !("banner" in s)) return;
    this.lastSocial = s;
    this.set(s.banner ?? null);
  };

  private onNews = () => {
    const v = news.view;
    if (!v || v === this.lastNews || !("banner" in v)) return;
    this.lastNews = v;
    this.set(v.banner ?? null);
  };

  /** A banner from the server (null: none). */
  set(b: SiteBanner | null): void {
    if (JSON.stringify(b) === JSON.stringify(this.current)) return;
    this.current = b;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    // Gone at its end time, without waiting for the next beat.
    const end = b?.endsAt ? Date.parse(b.endsAt) - Date.now() : null;
    if (end !== null && end > 0 && end < 2 ** 31)
      this.timer = setTimeout(() => this.emit(), end + 50);
    this.emit();
  }

  /** The banner to show now, if any. */
  visible(now = Date.now()): SiteBanner | null {
    const b = this.current;
    if (!b) return null;
    if (b.endsAt && Date.parse(b.endsAt) <= now) return null;
    const gone = readDismissed() ?? this.dismissedHere;
    return gone === b.v ? null : b;
  }

  dismiss(): void {
    const b = this.current;
    if (!b) return;
    this.dismissedHere = b.v;
    try {
      localStorage.setItem(BANNER_DISMISSED_KEY, String(b.v));
    } catch {
      // kept for this page only
    }
    this.emit();
  }

  private emit(): void {
    window.dispatchEvent(new CustomEvent(BANNER_EVENT));
  }
}

export const banner = new BannerClient();
