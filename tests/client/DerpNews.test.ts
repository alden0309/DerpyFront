// NEWS (r25): What's New on the page. An entry's body (the tiny markdown,
// and nothing in it ever HTML), the card's rules for each place (which
// games, "and N more", never twice, never over a game, a first visit gets
// none), what's been seen signed out (this browser) and signed in (the
// account, through the beat), and the bar's dot.

import { render } from "lit";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  cardFor,
  CONQUEST_NEWS,
  FRONT_NEWS,
  HOME_NEWS,
  NEWS_EVENT,
  NewsClient,
  news as pageNews,
  SEEN_KEY,
  seenUpTo,
  SETTLE_MS,
  SHOWN_KEY,
  type NewsPlace,
} from "../../src/derpland/News";
import { renderNewsBody } from "../../src/derpland/NewsBody";
import { NEWS_TEXT } from "../../src/derpland/NewsText";
import {
  NEWS_NOTHING,
  parseNewsBody,
  type NewsEntry,
  type NewsGame,
  type NewsView,
} from "../../src/derpland/NewsTypes";
import { social, SOCIAL_EVENT } from "../../src/derpland/Social";
import type { SocialState } from "../../src/derpland/SocialTypes";

const GAMES: NewsGame[] = [
  { id: "site", name: "Derp Land", color: "#f5cc3c" },
  { id: "derpyfront", name: "DerpyFront", color: "#4fa6e8" },
  { id: "conquest", name: "Derpy Conquest", color: "#ead8ae" },
];
const e = (id: string, game: string, title = id): NewsEntry => ({
  id,
  date: id.slice(0, 10),
  game,
  title,
  body: `About ${title}.`,
});
const SITE_OLD = e("2026-10-10-site-old", "site", "Old site news");
const FRONT_OLD = e("2026-10-11-front-old", "derpyfront");
const SITE_NEW = e("2026-10-20-store", "site", "A bigger Store");
const FRONT_NEW = e("2026-10-21-capitals", "derpyfront", "Capitals");
const CQ_NEW = e("2026-10-22-harbours", "conquest", "Harbours");

const viewOf = (
  entries: NewsEntry[],
  over: Partial<NewsView> = {},
): NewsView => ({
  signedIn: false,
  entries,
  games: GAMES,
  lastSeen: null,
  unseen: 0,
  ...over,
});

describe("an entry's body", () => {
  test("paragraphs, bullet lists, bold and italic", () => {
    expect(
      parseNewsBody(
        "First line\nsame paragraph.\n\n- one **big** thing\n  carried on\n* two *small*\n\nAfter.",
      ),
    ).toEqual([
      {
        list: false,
        parts: [{ text: "First line same paragraph." }],
      },
      {
        list: true,
        items: [
          [
            { text: "one " },
            { text: "big", b: true },
            { text: " thing carried on" },
          ],
          [{ text: "two " }, { text: "small", i: true }],
        ],
      },
      { list: false, parts: [{ text: "After." }] },
    ]);
    // Usernames keep their underscores, and a lone star is just a star.
    expect(parseNewsBody("Tester_Pat and 2 * 3")[0]).toEqual({
      list: false,
      parts: [{ text: "Tester_Pat and 2 * 3" }],
    });
  });

  test("nothing in it is ever HTML", () => {
    const host = document.createElement("div");
    render(
      renderNewsBody(
        'Hi <script>alert(1)</script> &amp; **<img src=x onerror="alert(2)">**\n\n- <a href="javascript:alert(3)">link</a>\n- *<b>i</b>*\n\n<iframe src="/"></iframe>',
      ),
      host,
    );
    expect(host.querySelector("script, img, a, b, iframe")).toBeNull();
    expect(host.querySelectorAll("p")).toHaveLength(2);
    expect(host.querySelectorAll("ul > li")).toHaveLength(2);
    expect(host.querySelector("strong")?.textContent).toBe(
      '<img src=x onerror="alert(2)">',
    );
    expect(host.querySelector("em")?.textContent).toBe("<b>i</b>");
    expect(host.textContent).toContain("<script>alert(1)</script> &amp;");
    expect(host.textContent).toContain('<iframe src="/"></iframe>');
  });
});

describe("the card for each place", () => {
  const v = viewOf([CQ_NEW, FRONT_NEW, SITE_NEW, FRONT_OLD, SITE_OLD]);
  const none = new Set<string>();

  test("the home: Derp Land's own news", () => {
    const c = cardFor(v, 3, HOME_NEWS, none)!;
    expect(c.entry.id).toBe(SITE_NEW.id);
    expect(c.game?.name).toBe("Derp Land");
    expect(c.more).toBe(0);
  });

  test("DerpyFront's menu: DerpyFront's and Derp Land's, newest first, and N more", () => {
    const c = cardFor(v, 5, FRONT_NEWS, none)!;
    expect(c.entry.id).toBe(FRONT_NEW.id);
    expect(c.more).toBe(3);
    expect(c.covers).toEqual([
      FRONT_NEW.id,
      SITE_NEW.id,
      FRONT_OLD.id,
      SITE_OLD.id,
    ]);
  });

  test("Conquest's start: Conquest's and Derp Land's", () => {
    const c = cardFor(v, 3, CONQUEST_NEWS, none)!;
    expect(c.entry.id).toBe(CQ_NEW.id);
    expect(c.more).toBe(1);
  });

  test("a place that names its own game shows only that game's", () => {
    const own: NewsPlace = { key: "other", games: ["other"] };
    expect(cardFor(v, 5, own, none)).toBeNull();
    const withIt = viewOf([e("2026-10-23-other", "other"), ...v.entries]);
    expect(cardFor(withIt, 6, own, none)?.more).toBe(0);
  });

  test("closing a card moves the mark only through what cards have closed", () => {
    // New, newest first: Conquest's, DerpyFront's, Derp Land's.
    expect(seenUpTo(v, 3, new Set([SITE_NEW.id]))).toBe(SITE_NEW.id);
    // The newest closed, an older one not: the mark can't pass the older.
    expect(seenUpTo(v, 3, new Set([CQ_NEW.id]))).toBeNull();
    expect(seenUpTo(v, 3, new Set([CQ_NEW.id, SITE_NEW.id]))).toBe(SITE_NEW.id);
    expect(
      seenUpTo(v, 3, new Set([SITE_NEW.id, FRONT_NEW.id, CQ_NEW.id])),
    ).toBe(CQ_NEW.id);
    expect(seenUpTo(v, 0, new Set([SITE_NEW.id]))).toBeNull();
    // What another card closed isn't counted again in "and N more".
    const c = cardFor(v, 5, FRONT_NEWS, new Set(), new Set([SITE_NEW.id]))!;
    expect(c.entry.id).toBe(FRONT_NEW.id);
    expect(c.more).toBe(2);
  });

  test("only what's new, and never what a card has covered", () => {
    expect(cardFor(v, 0, HOME_NEWS, none)).toBeNull();
    // Only Conquest's is new: nothing for the home.
    expect(cardFor(v, 1, HOME_NEWS, none)).toBeNull();
    expect(cardFor(v, 3, HOME_NEWS, new Set([SITE_NEW.id]))).toBeNull();
    // DerpyFront's menu after the home's card: its own news still comes.
    const c = cardFor(v, 3, FRONT_NEWS, new Set([SITE_NEW.id]))!;
    expect(c.entry.id).toBe(FRONT_NEW.id);
    expect(c.more).toBe(1);
  });
});

// ---- the page's side, with the API faked --------------------------------

let served: NewsView;
let posts: { upTo: string }[] = [];

function fakeApi(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/news/seen")) {
        const body = JSON.parse(String(init?.body)) as { upTo: string };
        posts.push(body);
        const at = served.entries.findIndex((x) => x.id === body.upTo);
        served = { ...served, unseen: Math.min(served.unseen, at) };
        return new Response(JSON.stringify(served), { status: 200 });
      }
      if (url.endsWith("/news"))
        return new Response(JSON.stringify(served), { status: 200 });
      return new Response("{}", { status: 404 });
    }),
  );
}

const cardEl = () => document.querySelector("derp-news-card");
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(SETTLE_MS + 50);
  await vi.dynamicImportSettled();
  await vi.advanceTimersByTimeAsync(10);
  await (cardEl() as unknown as { updateComplete?: Promise<unknown> })
    ?.updateComplete;
}
const clients: NewsClient[] = [];
function client(): NewsClient {
  const c = new NewsClient();
  clients.push(c);
  return c;
}
/** A page: a fresh client, as each page load has. */
async function page(place: NewsPlace | null): Promise<NewsClient> {
  const c = client();
  c.start();
  await vi.advanceTimersByTimeAsync(0);
  c.setPlace(place);
  await settle();
  return c;
}
const closeCard = () =>
  (
    cardEl()?.shadowRoot?.querySelector(".x") as HTMLButtonElement | null
  )?.click();

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  document.body.className = "";
  posts = [];
  fakeApi();
});
afterEach(() => {
  for (const c of clients.splice(0)) c.stop();
  for (const el of document.querySelectorAll("derp-news-card")) el.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  social.state = null;
});

describe("signed out: what this browser has seen", () => {
  test("a first visit gets no card of old news, and nothing is new", async () => {
    served = viewOf([SITE_NEW, SITE_OLD]);
    const c = await page(HOME_NEWS);
    expect(c.unseen).toBe(0);
    expect(cardEl()).toBeNull();
    expect(localStorage.getItem(SEEN_KEY)).toBe(SITE_NEW.id);
  });

  test("a first visit with no news yet: whatever comes after is new", async () => {
    served = viewOf([]);
    await page(HOME_NEWS);
    expect(localStorage.getItem(SEEN_KEY)).toBe(NEWS_NOTHING);
    served = viewOf([SITE_NEW]);
    const c = await page(null);
    expect(c.unseen).toBe(1);
  });

  test("news since: the card once, closing it sees them", async () => {
    localStorage.setItem(SEEN_KEY, SITE_OLD.id);
    served = viewOf([FRONT_NEW, SITE_NEW, SITE_OLD]);
    const c = await page(HOME_NEWS);
    expect(c.unseen).toBe(2);
    const card = cardEl()!;
    expect(card).not.toBeNull();
    const root = card.shadowRoot!;
    expect(root.querySelector("h2")?.textContent).toBe("A bigger Store");
    expect(root.querySelector(".tag")?.textContent).toBe("Derp Land");
    // Only one of the home's is new: no "and N more".
    expect(root.querySelector(".more")).toBeNull();
    closeCard();
    await vi.advanceTimersByTimeAsync(0);
    expect(cardEl()).toBeNull();
    // Up to the home's newest: DerpyFront's newer one is still new.
    expect(localStorage.getItem(SEEN_KEY)).toBe(SITE_NEW.id);
    expect(c.unseen).toBe(1);
    expect(posts).toEqual([]);
  });

  test("each place gets its own card: closing the home's doesn't see DerpyFront's", async () => {
    const PARTIES = e("2026-10-23-parties", "site", "Parties");
    localStorage.setItem(SEEN_KEY, SITE_OLD.id);
    served = viewOf([PARTIES, FRONT_NEW, SITE_OLD]);
    const home = await page(HOME_NEWS);
    expect(cardEl()?.shadowRoot?.querySelector("h2")?.textContent).toBe(
      "Parties",
    );
    closeCard();
    await vi.advanceTimersByTimeAsync(0);
    // DerpyFront's (older) is still unseen, so the mark stays and so does the dot.
    expect(localStorage.getItem(SEEN_KEY)).toBe(SITE_OLD.id);
    expect(home.unseen).toBe(2);

    const front = await page(FRONT_NEWS);
    const root = cardEl()!.shadowRoot!;
    expect(root.querySelector("h2")?.textContent).toBe("Capitals");
    expect(root.querySelector(".more")).toBeNull();
    closeCard();
    await vi.advanceTimersByTimeAsync(0);
    expect(localStorage.getItem(SEEN_KEY)).toBe(PARTIES.id);
    expect(front.unseen).toBe(0);
  });

  test("never twice: the next page doesn't show it again, even unclosed", async () => {
    localStorage.setItem(SEEN_KEY, SITE_OLD.id);
    served = viewOf([SITE_NEW, SITE_OLD]);
    await page(HOME_NEWS);
    expect(cardEl()).not.toBeNull();
    cardEl()!.remove(); // gone with its page
    const next = await page(HOME_NEWS);
    expect(cardEl()).toBeNull();
    expect(next.unseen).toBe(1); // still new: the dot stays
    expect(JSON.parse(localStorage.getItem(SHOWN_KEY)!)).toEqual([SITE_NEW.id]);
  });

  test("DerpyFront's menu: its own, then Derp Land's, and N more with the link", async () => {
    localStorage.setItem(SEEN_KEY, SITE_OLD.id);
    served = viewOf([CQ_NEW, FRONT_NEW, SITE_NEW, SITE_OLD]);
    await page(FRONT_NEWS);
    const card = cardEl()!;
    expect(card.hasAttribute("blue")).toBe(true);
    const root = card.shadowRoot!;
    expect(root.querySelector("h2")?.textContent).toBe("Capitals");
    expect(root.querySelector(".more")?.textContent).toContain("and 1 more");
    expect(
      root.querySelector<HTMLAnchorElement>("a.all")?.getAttribute("href"),
    ).toBe("/whats-new");
  });

  test("never over a game, and gone when one starts", async () => {
    localStorage.setItem(SEEN_KEY, SITE_OLD.id);
    served = viewOf([FRONT_NEW, SITE_OLD]);
    document.body.classList.add("in-game");
    await page(FRONT_NEWS);
    expect(cardEl()).toBeNull();

    document.body.classList.remove("in-game");
    // A link straight into a game: the menu comes and goes at once.
    const c = client();
    c.start();
    c.setPlace(FRONT_NEWS);
    await vi.advanceTimersByTimeAsync(200);
    c.setPlace(null);
    await settle();
    expect(cardEl()).toBeNull();

    // Shown on the menu, then a game starts: gone, nothing marked.
    const d = await page(FRONT_NEWS);
    expect(cardEl()).not.toBeNull();
    d.setPlace(null);
    expect(cardEl()).toBeNull();
    expect(localStorage.getItem(SEEN_KEY)).toBe(SITE_OLD.id);
    expect(d.unseen).toBe(1);
  });

  test("Conquest's start screen, and nothing for the home from it", async () => {
    localStorage.setItem(SEEN_KEY, SITE_OLD.id);
    served = viewOf([CQ_NEW, SITE_OLD]);
    await page(HOME_NEWS);
    expect(cardEl()).toBeNull();
    await page(CONQUEST_NEWS);
    expect(cardEl()?.shadowRoot?.textContent).toContain("Harbours");
  });

  test("a browser that can't keep anything: seeing the card is seeing it", async () => {
    served = viewOf([SITE_NEW, SITE_OLD]);
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("private window");
      });
    // Its first visit can't be kept either: every page is a first visit.
    const c = await page(HOME_NEWS);
    expect(c.unseen).toBe(0);
    expect(cardEl()).toBeNull();
    setItem.mockRestore();
  });
});

describe("signed in: the account keeps it, the beat brings the count", () => {
  const beatWith = (unseen: number, newest: string) => {
    social.state = {
      ...(social.state ?? {}),
      news: { unseen, newest },
    } as SocialState;
    window.dispatchEvent(new CustomEvent(SOCIAL_EVENT));
  };

  test("the dot from the beat, the card, and closing it marks the account", async () => {
    localStorage.setItem("derpy_session_token", "tok");
    served = viewOf([SITE_NEW, SITE_OLD], {
      signedIn: true,
      unseen: 1,
      lastSeen: SITE_OLD.id,
    });
    const c = client();
    c.start();
    let dots = 0;
    const onNews = () => dots++;
    window.addEventListener(NEWS_EVENT, onNews);
    beatWith(1, SITE_NEW.id);
    expect(c.unseen).toBe(1);
    expect(dots).toBeGreaterThan(0);
    c.setPlace(HOME_NEWS);
    await settle();
    expect(cardEl()?.shadowRoot?.textContent).toContain("A bigger Store");
    closeCard();
    await vi.advanceTimersByTimeAsync(0);
    expect(posts).toEqual([{ upTo: SITE_NEW.id }]);
    expect(c.unseen).toBe(0);
    // Nothing signed in is kept in the browser's seen mark.
    expect(localStorage.getItem(SEEN_KEY)).toBeNull();
    window.removeEventListener(NEWS_EVENT, onNews);
  });

  test("nothing new on the beat: no list fetched at all", async () => {
    localStorage.setItem("derpy_session_token", "tok");
    served = viewOf([SITE_NEW], { signedIn: true });
    const c = client();
    c.start();
    beatWith(0, SITE_NEW.id);
    c.setPlace(HOME_NEWS);
    await settle();
    expect(fetch).not.toHaveBeenCalled();
    expect(cardEl()).toBeNull();
  });
});

describe("the bar", () => {
  test("What's New with a dot while something is new", async () => {
    served = viewOf([]);
    await import("../../src/derpland/DerpBar");
    const bar = document.createElement("derp-bar");
    document.body.appendChild(bar);
    await vi.advanceTimersByTimeAsync(0);
    await (bar as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;
    const link = () =>
      bar.shadowRoot!.querySelector<HTMLAnchorElement>('a[href="/whats-new"]');
    expect(link()?.textContent).toContain("What's New");
    expect(link()?.querySelector(".news-dot")).toBeNull();
    pageNews.unseen = 2;
    window.dispatchEvent(new CustomEvent(NEWS_EVENT));
    await (bar as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;
    expect(link()?.querySelector(".news-dot")).not.toBeNull();
    pageNews.unseen = 0;
    bar.remove();
  });

  test("DerpyFront's translations have every word", async () => {
    const en = (await import("../../resources/lang/en.json")).default as {
      derp_news: Record<string, string>;
    };
    expect(Object.keys(en.derp_news).sort()).toEqual(
      Object.keys(NEWS_TEXT).sort(),
    );
    for (const [k, v] of Object.entries(NEWS_TEXT))
      expect(en.derp_news[k]).toBe(v);
  });
});
