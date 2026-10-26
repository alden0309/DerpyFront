// ADMIN (r26): bundling the admin page's script (src/admin/Main.ts) into one
// file with esbuild. Build time only: scripts/buildAdmin.ts (the last step
// of build-prod) and the tests call it. The server never imports this file
// (tests/AdminSecrecy.test.ts checks), so esbuild never runs on the 512 MB
// server: it only reads what the build wrote (AdminBundle.ts).

import { createHash } from "crypto";
import type { Plugin } from "esbuild";
import fs from "fs";
import path from "path";
import {
  ADMIN_DIST,
  ADMIN_ENTRY,
  ADMIN_MANIFEST,
  type AdminBundle,
  ROOT,
} from "./AdminBundle";

/**
 * The page keeps the hub's stylesheet (fonts, the bar, the hub's
 * components) and the admin's own styles ride in the script (styles.ts).
 * A stylesheet a section imports (PROFILE's pictures view: pictures.css and
 * the hub's looks.css) rides in it too, minified, as a <style> added when
 * the script runs.
 */
function cssAsStyle(esbuild: typeof import("esbuild")): Plugin {
  return {
    name: "admin-css",
    setup(b) {
      b.onLoad({ filter: /\.css$/ }, async (args) => {
        const css = await esbuild.transform(
          await fs.promises.readFile(args.path, "utf8"),
          { loader: "css", minify: true },
        );
        const text = JSON.stringify(css.code.trim());
        return {
          loader: "js",
          contents: `{const s=document.createElement("style");s.textContent=${text};document.head.appendChild(s);}`,
        };
      });
    },
  };
}

/** Bundles the admin page's script (esbuild, a dev dependency of the build). */
export async function bundleAdmin(): Promise<AdminBundle> {
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
      plugins: [cssAsStyle(esbuild)],
      tsconfig: path.join(ROOT, "tsconfig.json"),
      logLevel: "silent",
    });
    const js = out.outputFiles[0].text;
    return {
      js,
      hash: createHash("sha256").update(js).digest("hex").slice(0, 16),
    };
  } finally {
    await esbuild.stop();
  }
}

/** Writes the bundle and its manifest into `dir` (the build's step). */
export async function writeAdminBundle(dir = ADMIN_DIST): Promise<AdminBundle> {
  const b = await bundleAdmin();
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const file = `app-${b.hash}.js`;
  fs.writeFileSync(path.join(dir, file), b.js);
  fs.writeFileSync(
    path.join(dir, ADMIN_MANIFEST),
    JSON.stringify({ file, hash: b.hash, builtAt: new Date().toISOString() }),
  );
  return b;
}
