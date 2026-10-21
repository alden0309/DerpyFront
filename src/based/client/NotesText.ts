// r26: his notes for the writer as one piece of plain text, to paste into a
// chat: a heading, then each note as the server wrote it (the scene, when,
// the line on screen, the choices that led there, the note), numbered in
// the order he wrote them.

import type { MyNote } from "./Api";

/** All of them as one piece of text, newest last (the order he wrote them). */
export function notesText(notes: MyNote[], now = new Date()): string {
  const when = now.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const head = `Mr. Based: ${notes.length} note${notes.length === 1 ? "" : "s"} for the writer (copied ${when})`;
  return [
    head,
    ...notes.map((n, i) => `${i + 1}. ${n.entry.replace(/\n/g, "\n   ")}`),
  ].join("\n\n");
}
