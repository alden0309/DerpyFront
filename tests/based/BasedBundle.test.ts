// Mr. Based's story must never ship in the site's public JavaScript: the
// page and the Derp Land home may only reach the story through the API. This
// walks every module the two pages import and checks that none of them is a
// chapter, a picture or sound from the game's folder, or the server, and
// that none of them contains a line of the story.

import fs from "fs";
import path from "path";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { parseChapter } from "../../src/based/engine/Script";

const ROOT = path.resolve(__dirname, "../..");

function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null; // packages from node_modules
  const base = path.resolve(path.dirname(from), spec.replace(/\?.*$/, ""));
  for (const cand of [
    base,
    `${base}.ts`,
    `${base}/index.ts`,
    base.replace(/\.js$/, ".ts"),
  ]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return base;
}

function imports(file: string): string[] {
  if (!/\.(ts|js|mjs)$/.test(file)) return [];
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !(ts.isImportDeclaration(node) && node.importClause?.isTypeOnly)
    ) {
      out.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      out.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function graph(entry: string): { files: Set<string>; specs: string[] } {
  const files = new Set<string>();
  const specs: string[] = [];
  const todo = [path.join(ROOT, entry)];
  while (todo.length > 0) {
    const f = todo.pop()!;
    if (files.has(f)) continue;
    files.add(f);
    for (const spec of imports(f)) {
      specs.push(spec);
      const r = resolve(f, spec);
      if (r !== null && !files.has(r)) todo.push(r);
    }
  }
  return { files, specs };
}

const story = parseChapter(
  fs.readFileSync(path.join(ROOT, "src/based/story/chapter-01.story"), "utf8"),
).chapter;

// Lines only the story has: names of its people, and some of its words.
const SENTINELS = [
  ...story.cast.map((c) => c.name).filter((n) => !/^(Mr\. Based|The )/.test(n)),
  "Kir Royale",
  "TENIR PAROLE",
  "Le Serment",
  "CLOVIS",
];

describe.each(["src/based/client/Main.ts", "src/hub/Main.ts"])(
  "what %s ships",
  (entry) => {
    const { files, specs } = graph(entry);
    const rel = [...files].map((f) => path.relative(ROOT, f));

    test("no chapter, picture, sound or server code", () => {
      expect(
        rel.filter((f) => /^src\/based\/(story|art|audio)\//.test(f)),
      ).toEqual([]);
      expect(rel.filter((f) => f.startsWith("src/server/"))).toEqual([]);
      expect(
        specs.filter((s) => /\?(raw|url|inline)/.test(s) && /based/.test(s)),
      ).toEqual([]);
    });

    test("no line of the story", () => {
      expect(SENTINELS.length).toBeGreaterThan(5);
      for (const f of files) {
        if (!fs.existsSync(f) || !fs.statSync(f).isFile()) continue;
        const text = fs.readFileSync(f, "utf8");
        for (const s of SENTINELS) {
          expect(
            text.includes(s),
            `${path.relative(ROOT, f)} contains "${s}"`,
          ).toBe(false);
        }
      }
    });
  },
);
