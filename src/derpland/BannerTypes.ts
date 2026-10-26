// ADMIN (r26): the site banner, as the server sends it to every page with
// the top bar (types only: the server and the pages share them). It rides
// on what pages already fetch: the 15-second social beat (signed in) and
// What's New's list (signed out, once per page).

export interface SiteBanner {
  /** Changes whenever the owner changes the banner: what "dismissed" remembers. */
  v: number;
  text: string;
  /** A page on the site ("/store") or a whole https:// address. */
  link?: string;
  linkText?: string;
  /** When it stops showing (ISO), if it does. */
  endsAt?: string;
}

/** A banner's link: a path on this site, or an https:// address elsewhere. */
export const BANNER_LINK_RE =
  /^(?:\/(?!\/)[A-Za-z0-9\-._~/?#=&%+]*|https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9\-._~/?#=&%+:@!$'()*,;]*)?)$/;

export const BANNER_TEXT_MAX = 200;
export const BANNER_LINK_TEXT_MAX = 40;
