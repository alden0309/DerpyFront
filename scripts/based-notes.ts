// Prints the notes left for the writer while playing Mr. Based, grouped by
// chapter and scene, with the line on screen and the path taken to it.
//
//   DATABASE_URL=postgres://... npx tsx scripts/based-notes.ts
//   ... --chapter 1        only chapter 1
//   ... --since 2026-10-01 only notes since then
//   ... --last 5           only the newest five
//   ... --json             as JSON

import fs from "fs";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";
import { parseChapter } from "../src/based/engine/Script";
import { Chapter } from "../src/based/engine/Types";
import {
  formatNotes,
  listNotes,
  NoteQuery,
} from "../src/server/derpy/BasedNotes";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STORY = path.resolve(HERE, "../src/based/story");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq?.slice(name.length + 3);
}

function chapters(): Map<number, Chapter> {
  const out = new Map<number, Chapter>();
  for (const f of fs.readdirSync(STORY)) {
    const m = /^chapter-(\d{2})\.story$/.exec(f);
    if (!m) continue;
    const { chapter } = parseChapter(
      fs.readFileSync(path.join(STORY, f), "utf8"),
    );
    out.set(Number(m[1]), chapter);
  }
  return out;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL to the Derp Land database.");
    process.exit(1);
  }
  const q: NoteQuery = {};
  if (arg("chapter")) q.chapter = Number(arg("chapter"));
  if (arg("since")) q.since = new Date(arg("since")!);
  if (arg("last")) q.last = Number(arg("last"));
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const exists = await client.query(
      "SELECT to_regclass('derpy_based_notes') IS NOT NULL AS ok",
    );
    if (!exists.rows[0].ok) {
      console.log(
        "No notes for the writer yet (the notes table hasn't been made).",
      );
      return;
    }
    const notes = await listNotes(client, q);
    if (process.argv.includes("--json")) {
      console.log(JSON.stringify(notes, null, 2));
    } else {
      process.stdout.write(formatNotes(notes, chapters()));
    }
  } finally {
    await client.end();
  }
}

void main();
