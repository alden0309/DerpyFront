// NEWS (r25): What's New's entries, Mr. Based's among them, live in a file
// only the server reads. No page's JavaScript may reach it: from every
// page's entry (the hub, DerpyFront, Derpy Conquest, Mr. Based), through
// every import a bundle follows (static and lazy), nothing under
// src/server/ is reached, nor the entries file. And the news code every
// page loads never names Mr. Based: the server sends its games' names, and
// only to those who may see them.

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
  } else if (clean.startsWith("resources/")) base = clean;
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

/** Every file a page's bundle can load, from its entry. */
function reachable(entry: string): Set<string> {
  const seen = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (!/\.(ts|js|mjs)$/.test(file)) continue;
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const m of text.matchAll(IMPORT)) {
      const spec = m[1] ?? m[2] ?? m[3];
      const r = resolve(file, spec);
      if (r === null || seen.has(r)) continue;
      seen.add(r);
      queue.push(r);
    }
  }
  return seen;
}

describe("What's New stays on the server", () => {
  for (const entry of ENTRIES)
    test(`${entry} never reaches the server's files`, () => {
      const files = [...reachable(entry)];
      // It does load the bar, and with it What's New's page side.
      expect(files).toContain("src/derpland/News.ts");
      expect(files).toContain("src/derpland/NewsPopup.ts");
      expect(files.filter((f) => f.startsWith("src/server/"))).toEqual([]);
      expect(files.filter((f) => f.includes("entries.json"))).toEqual([]);
    });

  test("the news code every page loads never names Mr. Based", () => {
    const shared = [
      "src/derpland/News.ts",
      "src/derpland/NewsTypes.ts",
      "src/derpland/NewsText.ts",
      "src/derpland/NewsBody.ts",
      "src/derpland/NewsPopup.ts",
      "src/hub/News.ts",
      "src/hub/news.css",
    ];
    for (const f of shared) {
      const text = fs.readFileSync(path.join(ROOT, f), "utf8").toLowerCase();
      expect(text, f).not.toContain("based");
    }
    const en = JSON.parse(
      fs.readFileSync(path.join(ROOT, "resources/lang/en.json"), "utf8"),
    ) as { derp_news: Record<string, string> };
    expect(JSON.stringify(en.derp_news).toLowerCase()).not.toContain("based");
  });

  test("the pages' HTML has none of it", () => {
    for (const page of ["derpland.html", "index.html", "conquest.html"]) {
      const html = fs.readFileSync(path.join(ROOT, page), "utf8");
      expect(html).not.toContain("entries.json");
      expect(html).not.toContain("derpy/news");
    }
  });
});
