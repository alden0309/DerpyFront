// NEWS (r25): this page's side of Derp Land's What's New. One per page,
// whatever shows it: how many entries are new to this viewer (the dot on
// the bar's What's New), the entries themselves once something needs them,
// and the one small card a page may show (NewsPopup.ts, loaded only then).
//
// Signed in, the count comes with the social beat every 15 seconds
// (Social.ts), so there's no poll of its own, and what's been seen is kept on
// the account. Signed out, the page asks /derpy/api/news once and what's
// been seen is kept in this browser.
//
// Where the card may show, each page says with setPlace(): the Derp Land
// home, DerpyFront's menu, Conquest's start screen (and one more, which
// names itself). Leaving that place (a game starting, a lobby, another
// page of the menu) takes the card away.

import { api, DERPY_ACCOUNT_EVENT, derpyToken } from "./Account";
import { englishNews, type NewsTranslate } from "./NewsText";
import {
  newerMark,
  NEWS_NOTHING,
  newsOrder,
  unseenCount,
  type NewsEntry,
  type NewsGame,
  type NewsView,
} from "./NewsTypes";
import { social, SOCIAL_EVENT } from "./Social";

/** Fired on window when the count or the entries change. */
export const NEWS_EVENT = "derp-news";

/** A place a page may show the card, and the games whose news shows there. */
export interface NewsPlace {
  key: string;
  games: readonly string[];
  /** DerpyFront's blue instead of Derp Land's banana. */
  blue?: boolean;
}

export const HOME_NEWS: NewsPlace = { key: "home", games: ["site"] };
export const FRONT_NEWS: NewsPlace = {
  key: "derpyfront",
  games: ["derpyfront", "site"],
  blue: true,
};
export const CONQUEST_NEWS: NewsPlace = {
  key: "conquest",
  games: ["conquest", "site"],
};

/** Signed out: the newest entry seen in this browser. */
export const SEEN_KEY = "derp_news_seen";
/** The entries a card has already covered, on any page: never twice. */
export const SHOWN_KEY = "derp_news_shown";
/** The entries whose card was closed (seen, as far as the mark can go). */
export const CLOSED_KEY = "derp_news_closed";
/** How long a page sits in a place before its card shows. */
export const SETTLE_MS = 1200;

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return localStorage.getItem(key) === value;
  } catch {
    return false;
  }
}

function readSet(key: string): Set<string> {
  try {
    const v = JSON.parse(readLocal(key) ?? "[]");
    return new Set(
      Array.isArray(v) ? v.filter((x) => typeof x === "string") : [],
    );
  } catch {
    return new Set();
  }
}

function writeSet(key: string, ids: Iterable<string>): boolean {
  return writeLocal(key, JSON.stringify([...ids].slice(-200)));
}

/** What a card would show: the lead entry, how many more, what it covers. */
export interface NewsCard {
  entry: NewsEntry;
  game: NewsGame | undefined;
  more: number;
  /** This place's new entries, all of them (the card covers them). */
  covers: string[];
}

/**
 * The card for a place, or null: the newest of this place's new entries
 * that no card has covered yet, and how many more of this place's new ones
 * there are (not counting those another card's closing saw). `unseen` is
 * how many of `view.entries` (newest first) are new.
 */
export function cardFor(
  view: NewsView,
  unseen: number,
  place: NewsPlace,
  shown: ReadonlySet<string>,
  closed: ReadonlySet<string> = new Set(),
): NewsCard | null {
  const fresh = view.entries
    .slice(0, Math.max(0, unseen))
    .filter((e) => place.games.includes(e.game) && !closed.has(e.id));
  const lead = fresh.find((e) => !shown.has(e.id));
  if (lead === undefined) return null;
  return {
    entry: lead,
    game: view.games.find((g) => g.id === lead.game),
    more: fresh.length - 1,
    covers: fresh.map((e) => e.id),
  };
}

/**
 * How far closing cards moves the mark (null: not at all). What's been seen
 * is one mark, the newest entry seen, and everything older counts as seen
 * with it. So the mark moves up from the oldest new entry only through
 * entries whose card was closed: closing the home's card doesn't see
 * DerpyFront's news, and that still gets its own card on DerpyFront's menu.
 */
export function seenUpTo(
  view: NewsView,
  unseen: number,
  closed: ReadonlySet<string>,
): string | null {
  let upTo: string | null = null;
  for (let i = Math.min(unseen, view.entries.length) - 1; i >= 0; i--) {
    const id = view.entries[i].id;
    if (!closed.has(id)) break;
    upTo = id;
  }
  return upTo;
}

/** What a shown card is to this module (NewsPopup's element). */
interface CardElement extends HTMLElement {
  close(): void;
}

export class NewsClient {
  /** What /news said, once asked (null: not yet, or the account changed). */
  view: NewsView | null = null;
  /** How many entries are new to this viewer: the dot. */
  unseen = 0;
  /** The card's words (DerpyFront's bar passes translated ones). */
  text: NewsTranslate = englishNews;

  private started = false;
  private loading: Promise<void> | null = null;
  private tried = false;
  private lastBeat: unknown = null;
  /** Signed out, when this browser can't keep it: this page's mark. */
  private pageMark: string | null = null;
  private place: NewsPlace | null = null;
  private settle: ReturnType<typeof setTimeout> | null = null;
  private card: CardElement | null = null;
  private opening = false;
  /** The entries a card covered, or closed, on this page (if the browser forgets). */
  private shownHere = new Set<string>();
  private closedHere = new Set<string>();

  /** Begin (once per page). */
  start(): void {
    if (this.started) return;
    this.started = true;
    window.addEventListener(SOCIAL_EVENT, this.onSocial);
    window.addEventListener(DERPY_ACCOUNT_EVENT, this.onAccount);
    if (derpyToken()) this.onSocial();
    else void this.load();
  }

  /** Done with this page (the tests make one client per page). */
  stop(): void {
    window.removeEventListener(SOCIAL_EVENT, this.onSocial);
    window.removeEventListener(DERPY_ACCOUNT_EVENT, this.onAccount);
    this.setPlace(null);
    this.started = false;
  }

  private emit(): void {
    window.dispatchEvent(new CustomEvent(NEWS_EVENT));
  }

  private onSocial = () => {
    const s = social.state;
    // Only a beat carries it; an action's answer (or the same beat again)
    // doesn't change it.
    if (!s?.news || s === this.lastBeat || !derpyToken()) return;
    this.lastBeat = s;
    const { unseen, newest } = s.news;
    if (this.view && (this.view.entries[0]?.id ?? null) !== newest) {
      // Something new since the list was fetched: fetch it again when needed.
      this.view = null;
      this.tried = false;
    }
    if (unseen !== this.unseen) {
      this.unseen = unseen;
      this.emit();
    }
    this.consider();
  };

  private onAccount = () => {
    this.view = null;
    this.tried = false;
    this.lastBeat = null;
    this.unseen = 0;
    this.hideCard();
    this.emit();
    // Signed in, the next beat says (Social.ts beats on the same event).
    if (!derpyToken()) void this.load();
  };

  /** Fetch the entries (once at a time; `again` even if they're here). */
  load(again = false): Promise<void> {
    if (!again && this.view) return Promise.resolve();
    this.loading ??= (async () => {
      try {
        const v = await api<NewsView>("/news");
        this.view = v;
        this.unseen = v.signedIn ? v.unseen : this.unseenHere(v);
      } catch {
        // No news on this page; the dot stays as it was.
      } finally {
        this.tried = true;
        this.loading = null;
      }
      this.emit();
      this.consider();
    })();
    return this.loading;
  }

  /** Signed out: what's new since this browser last looked. */
  private unseenHere(v: NewsView): number {
    const mark = readLocal(SEEN_KEY) ?? this.pageMark;
    if (mark === null) {
      // The first visit: what's out already isn't news.
      const first = v.entries[0]?.id ?? NEWS_NOTHING;
      if (!writeLocal(SEEN_KEY, first)) this.pageMark = first;
      return 0;
    }
    return unseenCount(v.entries, mark);
  }

  /** Seen, up to an entry (and everything older); never back. */
  async markSeen(upTo: string): Promise<void> {
    const v = this.view;
    if (!v) return;
    const at = v.entries.findIndex((e) => e.id === upTo);
    if (at < 0) return;
    // At once on the page; the account (or the browser) after.
    if (at < this.unseen) {
      this.unseen = at;
      this.emit();
    }
    if (v.signedIn) {
      try {
        const r = await api<NewsView>("/news/seen", {
          method: "POST",
          body: JSON.stringify({ upTo }),
          // A card's link leaves the page: the mark still gets there.
          keepalive: true,
        });
        this.view = r;
        this.unseen = r.unseen;
        this.emit();
      } catch {
        // The next beat says how it stands.
      }
      return;
    }
    const mark = readLocal(SEEN_KEY) ?? this.pageMark;
    if (mark === null || newerMark(upTo, mark, newsOrder(v.entries))) {
      if (!writeLocal(SEEN_KEY, upTo)) this.pageMark = upTo;
    }
  }

  /** Everything this viewer may see is seen (the What's New page). */
  markAllSeen(): Promise<void> {
    const top = this.view?.entries[0];
    return top ? this.markSeen(top.id) : Promise.resolve();
  }

  /** Where this page is now, for the card (null: nowhere it may show). */
  setPlace(place: NewsPlace | null): void {
    if (place?.key === this.place?.key) return;
    this.place = place;
    if (this.settle) clearTimeout(this.settle);
    this.settle = null;
    if (place === null) {
      this.hideCard();
      return;
    }
    this.start();
    this.settle = setTimeout(() => {
      this.settle = null;
      this.consider();
    }, SETTLE_MS);
  }

  /** The card, if this place has one to show now. */
  private consider(): void {
    const place = this.place;
    if (!place || this.settle || this.card || this.opening) return;
    // Never over a game (DerpyFront marks its page while one runs).
    if (document.body.classList.contains("in-game")) return;
    if (this.unseen <= 0) return;
    const v = this.view;
    if (!v) {
      // load() comes back here once the entries are in (once per list).
      if (!this.tried && !this.loading) void this.load();
      return;
    }
    const shown = readSet(SHOWN_KEY);
    for (const id of this.shownHere) shown.add(id);
    const closed = readSet(CLOSED_KEY);
    for (const id of this.closedHere) closed.add(id);
    const card = cardFor(v, this.unseen, place, shown, closed);
    if (card) void this.open(card, place, shown);
  }

  private async open(
    card: NewsCard,
    place: NewsPlace,
    shown: Set<string>,
  ): Promise<void> {
    this.opening = true;
    let show: typeof import("./NewsPopup").showNewsCard;
    try {
      ({ showNewsCard: show } = await import("./NewsPopup"));
    } catch {
      this.opening = false;
      return;
    }
    this.opening = false;
    // Moved on while it loaded (a game started, another page).
    if (this.place !== place || this.card) return;
    if (document.body.classList.contains("in-game")) return;
    this.card = show({
      card,
      text: this.text,
      blue: place.blue === true,
      onDone: () => {
        this.card = null;
        void this.closed(card);
      },
    });
    // Never twice: on any page, these entries have had their card.
    for (const id of card.covers) {
      shown.add(id);
      this.shownHere.add(id);
    }
    if (!writeSet(SHOWN_KEY, shown)) {
      // This browser can't remember it: seeing the card is seeing them.
      void this.markSeen(card.covers[0]);
    }
  }

  /** The player closed a card (or followed its link): those are seen. */
  private async closed(card: NewsCard): Promise<void> {
    const v = this.view;
    if (!v) return;
    const closed = readSet(CLOSED_KEY);
    for (const id of this.closedHere) closed.add(id);
    for (const id of card.covers) {
      closed.add(id);
      this.closedHere.add(id);
    }
    // Can't keep what was closed here: see up to the card's newest instead.
    const upTo = writeSet(CLOSED_KEY, closed)
      ? seenUpTo(v, this.unseen, closed)
      : card.covers[0];
    if (upTo !== null) await this.markSeen(upTo);
  }

  /** Take the card away without marking anything (a game is starting). */
  private hideCard(): void {
    this.card?.close();
    this.card = null;
  }
}

/** This page's. */
export const news = new NewsClient();
