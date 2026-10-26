// ADMIN (r26): the admin page's code is in nobody else's download. From
// every public page's entry (the hub, DerpyFront, Derpy Conquest, Mr.
// Based), through every import a bundle follows (static and lazy), nothing
// under src/admin/ (the page) or src/server/ is reached; the site's build
// doesn't name it; and the built site (static/, when there is one) holds
// none of it. The admin page's script is built into dist-admin/ instead,
// at build time: the server only reads it (never bundles it: esbuild isn't
// anywhere the running server reaches), and serves it only to the owner.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ENTRIES = [
  "src/hub/Main.ts",
  "src/client/Main.ts",
  "src/conquest/client/Main.ts",
  "src/based/client/Main.ts",
];

const IMPORT =
  /(?:import|export)\s[^'"`;]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function resolve(from: string, spec: string): string | null {
  const clean = spec.replace(/\?.*$/, "");
  let base: string;
  if (clean.startsWith(".")) base = path.join(path.dirname(from), clean);
  else if (clean.startsWith("@openfront/")) {
    const [, pkg, ...rest] = clean.split("/");
    base = path.join("packages", pkg, "src", ...rest);
  } else if (clean.startsWith("resources/") || clean.startsWith("src/"))
    base = clean;
  else return null; // an npm package
  for (const c of [
    base,
    `${base}.ts`,
    `${base}.js`,
    path.join(base, "index.ts"),
  ]) {
    const full = path.join(ROOT, c);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return c;
  }
  return null;
}

function reachable(entry: string): Set<string> {
  const seen = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (!/\.(ts|js|mjs)$/.test(file)) continue;
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const m of text.matchAll(IMPORT)) {
      const r = resolve(file, m[1] ?? m[2] ?? m[3]);
      if (r === null || seen.has(r)) continue;
      seen.add(r);
      queue.push(r);
    }
  }
  return seen;
}

/** Words only the admin page's code has. */
const MARKERS = [
  "dl-admin",
  "adm-overview",
  "adm-shell",
  "stale_sign_in",
  "Confirm your password",
];

describe("the admin page stays the owner's", () => {
  for (const entry of ENTRIES)
    test(`${entry} never reaches the admin page's code`, () => {
      const files = [...reachable(entry)];
      expect(files.length).toBeGreaterThan(5);
      expect(files.filter((f) => f.startsWith("src/admin/"))).toEqual([]);
      expect(files.filter((f) => f.startsWith("src/server/"))).toEqual([]);
    });

  test("the admin page's own script does reach it (the walk works)", () => {
    const files = [...reachable("src/admin/Main.ts")];
    expect(files).toContain("src/admin/sections/Accounts.ts");
    expect(files).toContain("src/derpland/DerpBar.ts");
    expect(files.filter((f) => f.startsWith("src/server/"))).toEqual([]);
  });

  test("the site's build has no admin entry, and builds the admin script outside static/", () => {
    const vite = fs.readFileSync(path.join(ROOT, "vite.config.ts"), "utf8");
    expect(vite).not.toMatch(/src\/admin|admin\.html/);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
    );
    expect(pkg.scripts["build-prod"]).toMatch(
      /&& tsx scripts\/buildAdmin\.ts$/,
    );
    const bundle = fs.readFileSync(
      path.join(ROOT, "src/server/derpy/admin/AdminBundle.ts"),
      "utf8",
    );
    expect(bundle).toContain('path.join(ROOT, "dist-admin")');
    const script = fs.readFileSync(
      path.join(ROOT, "scripts/buildAdmin.ts"),
      "utf8",
    );
    expect(script).toContain("writeAdminBundle");
    // The Docker image (upstream's way to ship) carries it from its build.
    const docker = fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
    expect(docker).toMatch(
      /COPY --from=build \/usr\/src\/app\/dist-admin \.\/dist-admin/,
    );
  });

  test("the running server never bundles it: nothing it reaches imports esbuild or the bundler", () => {
    const files = [
      ...new Set(
        ["src/server/Server.ts", "src/server/Master.ts"].flatMap((e) => [
          ...reachable(e),
        ]),
      ),
    ];
    // The walk reaches the admin page's server half (it works).
    expect(files).toContain("src/server/derpy/admin/AdminPage.ts");
    expect(files).toContain("src/server/derpy/admin/AdminBundle.ts");
    expect(files).not.toContain("src/server/derpy/admin/AdminBuild.ts");
    const esbuild = files.filter(
      (f) =>
        /\.(ts|js|mjs)$/.test(f) &&
        /(?:from|import\(?)\s*["']esbuild["']/.test(
          fs.readFileSync(path.join(ROOT, f), "utf8"),
        ),
    );
    expect(esbuild).toEqual([]);
  });

  const STATIC = path.join(ROOT, "static");
  const built = fs.existsSync(path.join(STATIC, "assets"));
  test.skipIf(!built)(
    "the built site (static/) holds none of the admin page",
    () => {
      const hits: string[] = [];
      const walk = (dir: string) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) walk(p);
          else if (/\.(js|css|html|json|map)$/.test(e.name)) {
            const text = fs.readFileSync(p, "utf8");
            for (const m of MARKERS)
              if (text.includes(m))
                hits.push(`${path.relative(ROOT, p)}: ${m}`);
          }
        }
      };
      walk(STATIC);
      expect(hits).toEqual([]);
    },
  );

  test("the admin script, bundled, has the page in it", async () => {
    const { bundleAdmin } =
      await import("../src/server/derpy/admin/AdminBuild");
    const b = await bundleAdmin();
    for (const m of MARKERS) expect(b.js, m).toContain(m);
    expect(b.hash).toMatch(/^[0-9a-f]{16}$/);
    // PROFILE's pictures tabs, and the stylesheets they import, ride in it
    // (as <style>s added when it runs).
    expect(b.js).toContain("adm-pictures");
    expect(b.js).toMatch(/\.adm-pics-count\{/);
    expect(b.js).not.toMatch(/^import\b|\bimport\s*["']/m);
  }, 60_000);
});
