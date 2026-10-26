// ADMIN (r26): the page at /admin, and its script. Neither is among the
// site's built files (static/): the page is Derp Land's own shell with the
// hub's script swapped for /admin/app-<hash>.js, and that script is built
// by build-prod into dist-admin/ (AdminBundle.ts). Both are sent only to a
// browser carrying the owner's admin cookie; any other request falls
// through, untouched, to whatever the site says for an address it doesn't
// have.

import type { NextFunction, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { logger } from "../../Logger";
import { renderHtmlContent } from "../../RenderHtml";
import { ownerFromCookie } from "./AdminAccess";
import { AdminBundle, bundleAdmin, readBuiltAdmin, ROOT } from "./AdminBundle";

const log = logger.child({ component: "DerpyAdmin" });

const BUILT_SHELL = path.join(ROOT, "static/derpland.html");
const SOURCE_SHELL = path.join(ROOT, "derpland.html");

/** The admin page's addresses: /admin and anything under it. */
export function isAdminPath(p: string): boolean {
  return p === "/admin" || p.startsWith("/admin/");
}

export const adminScriptPath = (hash: string) => `/admin/app-${hash}.js`;

let bundle: Promise<AdminBundle> | null = null;

/**
 * The admin page's script: the build's (dist-admin/), read once. Without a
 * build (tests, a local server run from source) it's bundled here, once.
 */
export function adminBundle(): Promise<AdminBundle> {
  bundle ??= (async () => {
    const built = readBuiltAdmin();
    if (built) return built;
    // A local server or tests: esbuild (only imported now) does it once.
    log.info("no built admin script (dist-admin/): bundling it here");
    return bundleAdmin();
  })().catch((err: unknown) => {
    bundle = null;
    throw err;
  });
  return bundle;
}

/** For tests: read (or bundle) it again next time. */
export function forgetAdminBundle(): void {
  bundle = null;
  shells = new Map();
}

let shells = new Map<string, Promise<string>>();

/**
 * Derp Land's page shell with the admin's script instead of the hub's: the
 * same head (fonts, the hub's stylesheet, the icon), its own title.
 */
export async function adminShell(hash: string): Promise<string> {
  let hit = shells.get(hash);
  if (!hit) {
    hit = (async () => {
      // The built shell carries the build's asset addresses (rendered as
      // every page is); without a build (or one missing its manifest), the
      // source shell has none.
      const built = fs.existsSync(BUILT_SHELL)
        ? await renderHtmlContent(BUILT_SHELL, { perServer: false }).catch(
            () => null,
          )
        : null;
      const html = built ?? (await fs.promises.readFile(SOURCE_SHELL, "utf8"));
      return shellFrom(html, adminScriptPath(hash));
    })();
    shells = new Map([[hash, hit]]);
    // A shell that couldn't be read is asked for again next time.
    hit.catch(() => {
      if (shells.get(hash) === hit) shells = new Map();
    });
  }
  return hit;
}

/** The hub's shell made the admin's: its script tags out, ours in. */
export function shellFrom(html: string, src: string): string {
  return html
    .replace(/<title>[^<]*<\/title>/, "<title>Admin · Derp Land</title>")
    .replace(/<script\b[^>]*\btype="module"[^>]*>\s*<\/script>\s*/g, "")
    .replace(/<link\b[^>]*\brel="modulepreload"[^>]*>\s*/g, "")
    .replace(
      "</head>",
      `  <script type="module" src="${src}"></script>\n  </head>`,
    );
}

function privateHeaders(res: Response, type: string, cacheable: boolean): void {
  res.setHeader(
    "Cache-Control",
    // The script's address names its contents, so the owner's browser may
    // keep it; never a shared cache. The page itself is never kept.
    cacheable
      ? "private, max-age=31536000, immutable"
      : "private, no-store, max-age=0",
  );
  res.setHeader("Vary", "Cookie");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Content-Type", type);
}

/** The middleware the master mounts (before its address-unknown fallback). */
export function adminPage() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (
      (req.method !== "GET" && req.method !== "HEAD") ||
      !isAdminPath(req.path)
    ) {
      next();
      return;
    }
    void (async () => {
      const owner = await ownerFromCookie(req).catch(() => null);
      if (owner === null) {
        next();
        return;
      }
      try {
        const b = await adminBundle();
        const script = /^\/admin\/app-([0-9a-f]{16})\.js$/.exec(req.path);
        if (script) {
          // An old address (from before a deploy) is simply not there.
          if (script[1] !== b.hash) {
            next();
            return;
          }
          privateHeaders(res, "text/javascript; charset=utf-8", true);
          res.send(b.js);
          return;
        }
        // Anything else under /admin is one of the page's own addresses
        // (/admin/accounts/12): the same page, which reads its address.
        if (/\.[a-z0-9]+$/i.test(req.path)) {
          next();
          return;
        }
        privateHeaders(res, "text/html; charset=utf-8", false);
        res.send(await adminShell(b.hash));
      } catch (err) {
        log.error(`admin page failed: ${err}`);
        if (!res.headersSent)
          res.status(500).send("The admin page couldn't be loaded.");
      }
    })();
  };
}
