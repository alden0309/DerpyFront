// BASED (r19): reading back the notes left for the writer while playing
// Mr. Based, for scripts/based-notes.ts. Each note keeps its scene, the line
// on screen when it was written, and the path taken to get there.

import pg from "pg";
import { Chapter } from "../../based/engine/Types";

export interface NoteRow {
  id: number;
  username: string;
  chapter: number;
  scene: string;
  line: string;
  path: string[];
  note: string;
  createdAt: Date;
}

export interface NoteQuery {
  chapter?: number;
  since?: Date;
  /** Only the newest N. */
  last?: number;
}

export async function listNotes(
  pool: pg.Pool | pg.Client,
  q: NoteQuery = {},
): Promise<NoteRow[]> {
  const r = await pool.query(
    `SELECT n.id, a.username, n.chapter, n.scene, n.line, n.path, n.note,
            n.created_at
     FROM derpy_based_notes n JOIN derpy_accounts a ON a.id = n.account_id
     WHERE ($1::int IS NULL OR n.chapter = $1)
       AND ($2::timestamptz IS NULL OR n.created_at >= $2)
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT $3`,
    [q.chapter ?? null, q.since ?? null, q.last ?? 10_000],
  );
  return r.rows
    .map((row) => ({
      id: Number(row.id),
      username: String(row.username),
      chapter: Number(row.chapter),
      scene: String(row.scene),
      line: String(row.line ?? ""),
      path: Array.isArray(row.path) ? (row.path as string[]) : [],
      note: String(row.note),
      createdAt: new Date(row.created_at),
    }))
    .reverse();
}

/** "open > vauban > reverie [The first glass] > t_glass > ..." */
export function describePath(path: string[], chapter?: Chapter): string {
  const parts: string[] = [];
  for (const step of path) {
    if (step.startsWith("s:")) {
      parts.push(step.slice(2));
    } else if (step.startsWith("c:")) {
      const [choice, option] = step.slice(2).split("=");
      let label = option;
      if (chapter) {
        for (const id of chapter.order) {
          for (const op of chapter.scenes[id].ops) {
            if (op.op === "choose" && op.id === choice) {
              label = op.options.find((o) => o.id === option)?.label ?? option;
            }
          }
        }
      }
      parts.push(`[${label}]`);
    }
  }
  return parts.join(" > ");
}

function stamp(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function formatNotes(
  notes: NoteRow[],
  chapters: Map<number, Chapter> = new Map(),
): string {
  if (notes.length === 0) return "No notes for the writer yet.\n";
  const out: string[] = [
    `Mr. Based: ${notes.length} note${notes.length === 1 ? "" : "s"} for the writer`,
    "",
  ];
  // Grouped by chapter and scene, in the order the scenes are written.
  const groups = new Map<string, NoteRow[]>();
  for (const n of notes) {
    const key = `${n.chapter}\u0000${n.scene}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(n);
  }
  const order = (n: NoteRow) => {
    const c = chapters.get(n.chapter);
    const i = c ? c.order.indexOf(n.scene) : -1;
    return n.chapter * 10_000 + (i < 0 ? 9_999 : i);
  };
  const sorted = [...groups.values()].sort((a, b) => order(a[0]) - order(b[0]));
  for (const group of sorted) {
    const first = group[0];
    const c = chapters.get(first.chapter);
    const scene = c?.scenes[first.scene];
    out.push(
      `Chapter ${first.chapter}, scene "${first.scene}"` +
        (scene
          ? ` (${scene.label}, script line ${scene.src})`
          : " (no longer in the script)"),
    );
    for (const n of group) {
      out.push(`  #${n.id}  ${stamp(n.createdAt)}  ${n.username}`);
      if (n.line) out.push(`  On screen: ${n.line}`);
      if (n.path.length > 0) out.push(`  Path: ${describePath(n.path, c)}`);
      for (const l of n.note.split(/\r?\n/)) out.push(`  > ${l}`);
      out.push("");
    }
  }
  return out.join("\n");
}
