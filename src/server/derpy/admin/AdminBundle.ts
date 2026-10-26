// ADMIN (r26): bundling the admin page's script (src/admin/Main.ts) into one
// file. The production build does it (scripts/buildAdmin.ts, the last step
// of build-prod) into dist-admin/, outside static/, so the site's public
// files never hold it and the server only reads a file. Without a build
// (tests, a local server), the server bundles it itself the first time the
// owner asks (AdminPage.ts).

import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "../../../..");
export const ADMIN_ENTRY = path.join(ROOT, "src/admin/Main.ts");
/** Where the build writes it: never served as a folder, never in static/. */
export const ADMIN_DIST = path.join(ROOT, "dist-admin");
export const ADMIN_MANIFEST = "admin-manifest.json";

export interface AdminBundle {
  js: string;
  /** The first 16 hex of its sha256: in its address, so it can be cached for good. */
  hash: string;
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
      // The page keeps the hub's stylesheet (fonts, the bar, the hub's
      // components); the admin's own styles ride in the script.
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

/** The built bundle, if the build made one. */
export function readBuiltAdmin(dir = ADMIN_DIST): AdminBundle | null {
  try {
    const m = JSON.parse(
      fs.readFileSync(path.join(dir, ADMIN_MANIFEST), "utf8"),
    ) as { file: string; hash: string };
    if (!/^app-[0-9a-f]{16}\.js$/.test(m.file)) return null;
    return {
      js: fs.readFileSync(path.join(dir, m.file), "utf8"),
      hash: m.hash,
    };
  } catch {
    return null;
  }
}
