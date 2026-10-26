// ADMIN (r26): the page at /admin, and its script. Neither is in the site's
// build (static/): the page is Derp Land's own shell with the hub's script
// swapped for /admin/app.js, and that script is bundled from src/admin/ by
// the server itself (esbuild, which tsx brings) the first time the owner
// asks, then kept in memory. Both are sent only to a browser carrying the
// owner's admin cookie; any other request falls through, untouched, to
// whatever the site says for an address it doesn't have.

import { createHash } from "crypto";
import type { NextFunction, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../../Logger";
import { renderHtmlContent } from "../../RenderHtml";
import { ownerFromCookie } from "./AdminAccess";

const log = logger.child({ component: "DerpyAdmin" });

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../..");
export const ADMIN_ENTRY = path.join(ROOT, "src/admin/Main.ts");
const BUILT_SHELL = path.join(ROOT, "static/derpland.html");
const SOURCE_SHELL = path.join(ROOT, "derpland.html");

export const ADMIN_SCRIPT_PATH = "/admin/app.js";

/** The admin page's addresses: /admin and anything under it. */
export function isAdminPath(p: string): boolean {
  return p === "/admin" || p.startsWith("/admin/");
}

let bundle: Promise<{ js: string; hash: string }> | null = null;

/** The admin page's script, bundled once per process. */
export function adminBundle(): Promise<{ js: string; hash: string }> {
  bundle ??= (async () => {
    const esbuild = await import("esbuild");
    try {
      const out = await esbuild.build({
        entryPoints: [ADMIN_ENTRY],
        bundle: true,
        write: false,
        format: "esm",
        platform: "browser",
        target: "es2022",
        minify: true,
        legalComments: "none",
        // The page keeps the hub's stylesheet (fonts, the bar's look, the
        // hub's components); the admin's own styles ride in the script.
        loader: { ".css": "empty" },
        tsconfig: path.join(ROOT, "tsconfig.json"),
        logLevel: "silent",
      });
      const js = out.outputFiles[0].text;
      return {
        js,
        hash: createHash("sha256").update(js).digest("hex").slice(0, 16),
      };
    } finally {
      // Its helper process isn't needed again until the next restart.
      await esbuild.stop();
    }
  })().catch((err: unknown) => {
    bundle = null;
    throw err;
  });
  return bundle;
}

/** For tests: bundle again next time. */
export function forgetAdminBundle(): void {
  bundle = null;
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
      // every page is); without a build (tests), the source shell has none.
      const html = fs.existsSync(BUILT_SHELL)
        ? await renderHtmlContent(BUILT_SHELL, { perServer: false })
        : await fs.promises.readFile(SOURCE_SHELL, "utf8");
      return shellFrom(html, `${ADMIN_SCRIPT_PATH}?v=${hash}`);
    })();
    shells = new Map([[hash, hit]]);
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

function privateHeaders(res: Response, type: string): void {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
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
      let owner: { id: number } | null = null;
      try {
        owner = await ownerFromCookie(req);
      } catch {
        owner = null;
      }
      if (owner === null) {
        next();
        return;
      }
      try {
        const { js, hash } = await adminBundle();
        if (req.path === ADMIN_SCRIPT_PATH) {
          privateHeaders(res, "text/javascript; charset=utf-8");
          res.send(js);
          return;
        }
        // Anything else under /admin is one of the page's own addresses
        // (/admin/accounts/12): the same page, which reads its address.
        if (/\.[a-z0-9]+$/i.test(req.path)) {
          next();
          return;
        }
        privateHeaders(res, "text/html; charset=utf-8");
        res.send(await adminShell(hash));
      } catch (err) {
        log.error(`admin page failed: ${err}`);
        if (!res.headersSent) res.status(500).send("The admin page failed to build.");
      }
    })();
  };
}
