// PROFILE (r26): a player's picture wherever their name shows (the top
// bar's token, profiles, friends, who's online, parties, leaderboards), and
// the badges they pin beside their name. The picture sits over their
// monogram, which shows while it loads and whenever it can't (a removed
// upload, no picture at all). Each place keeps its own token class for the
// size; AVATAR_CSS (and the hub's looks.css) adds the picture to it.

import { css, html, nothing, TemplateResult } from "lit";
import { badgeEmblem } from "./BadgeArt";
import { BADGE_BY_KEY } from "./Badges";
import { type Look, monogramColor, picSrc } from "./Pictures";

const broken = (e: Event) =>
  (e.target as HTMLElement).setAttribute("data-broken", "");
const loaded = (e: Event) =>
  (e.target as HTMLElement).removeAttribute("data-broken");

function inside(name: string, src: string | null): TemplateResult {
  return html`${name.slice(0, 1).toUpperCase()}${src
    ? html`<img
        class="av-img"
        src=${src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable="false"
        @error=${broken}
        @load=${loaded}
      />`
    : nothing}`;
}

/**
 * A player's picture in a token of class `cls` (which sets its size), or a
 * link to their page when `href` is given.
 */
export function avatar(
  name: string,
  pic: string | null | undefined,
  cls: string,
  href?: string,
): TemplateResult {
  const src = picSrc(pic);
  const color = monogramColor(pic, name);
  if (href !== undefined)
    return html`<a
      class="${cls} av"
      href=${href}
      style="--token:${color}"
      tabindex="-1"
      aria-hidden="true"
      >${inside(name, src)}</a
    >`;
  return html`<span
    class="${cls} av"
    style="--token:${color}"
    aria-hidden="true"
    >${inside(name, src)}</span
  >`;
}

/** The badges a player pins, small, each named on hover. */
export function pinnedBadges(
  keys: readonly string[] | undefined,
  cls = "av-pins",
): TemplateResult | typeof nothing {
  const known = (keys ?? []).filter((k) => BADGE_BY_KEY.has(k));
  if (known.length === 0) return nothing;
  return html`<span class=${cls}
    >${known.map((k) => {
      const b = BADGE_BY_KEY.get(k)!;
      return html`<span
        class="av-pin"
        role="img"
        aria-label=${b.name}
        title="${b.name}: ${b.how}"
        >${badgeEmblem(k, "av-pin-art")}</span
      >`;
    })}</span
  >`;
}

/** A look by account id, from a list's `looks` (the default when it isn't there). */
export function lookFor(
  looks: Record<string, Look> | undefined,
  id: number,
): Look {
  return looks?.[id] ?? { pic: null, badges: [] };
}

/** For shadow roots (the top bar, who's online): the picture inside a token. */
export const AVATAR_CSS = css`
  .av {
    position: relative;
    overflow: hidden;
    isolation: isolate;
  }
  .av-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    object-fit: cover;
    border-radius: inherit;
    display: block;
    background: var(--token);
  }
  .av-img[data-broken] {
    display: none;
  }
  .av-pins {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex: none;
    margin-left: 5px;
    vertical-align: middle;
  }
  .av-pin {
    display: inline-grid;
    line-height: 0;
  }
  .av-pin-art {
    display: block;
    width: 15px;
    height: 15px;
  }
`;
