// ADMIN (r26): the admin page's script (src/admin/Main.ts), as the build
// left it. The production build bundles it (scripts/buildAdmin.ts, the last
// step of build-prod, through AdminBuild.ts) into dist-admin/, outside
// static/, so the site's public files never hold it. The server only reads
// that file here, and sends it to the owner alone (AdminPage.ts); it never
// bundles anything itself.

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

/** The built bundle, if the build made one. */
export function readBuiltAdmin(dir = ADMIN_DIST): AdminBundle | null {
  try {
    const m = JSON.parse(
      fs.readFileSync(path.join(dir, ADMIN_MANIFEST), "utf8"),
    ) as { file: string; hash: string };
    if (!/^app-[0-9a-f]{16}\.js$/.test(m.file)) return null;
    if (!/^[0-9a-f]{16}$/.test(m.hash)) return null;
    return {
      js: fs.readFileSync(path.join(dir, m.file), "utf8"),
      hash: m.hash,
    };
  } catch {
    return null;
  }
}
