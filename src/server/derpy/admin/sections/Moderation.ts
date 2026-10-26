// ADMIN (r26): Moderation's usernames: the blocklist of words no new name
// may contain (sign-ups and renames, DerpyNames.nameProblem), and the
// accounts whose names have one now, to rename (Accounts' rename). Profile
// pictures and reports are their own sections, shown on Moderation's page
// (the admin page's registry: `parent: "moderation"`).

import { z } from "zod";
import { db } from "../../DerpyDb";
import { blockForms, blockWord } from "../../DerpyNames";
import { adminSection } from "../AdminRegistry";

async function blocklist(): Promise<{ word: string; createdAt: string }[]> {
  const r = await (
    await db()
  ).query("SELECT word, created_at FROM derpy_name_blocklist ORDER BY word");
  return r.rows.map((x) => ({
    word: String(x.word),
    createdAt: new Date(x.created_at).toISOString(),
  }));
}

const WordBody = z.object({ word: z.string().max(60) });

export const moderation = adminSection({
  id: "moderation",
  routes: [
    {
      method: "get",
      path: "/names",
      handler: async (_req, res) => {
        const words = await blocklist();
        // Accounts whose name (now) has a blocked word in it.
        const flagged: { id: number; username: string; word: string }[] = [];
        if (words.length > 0) {
          const r = await (
            await db()
          ).query(
            "SELECT id, username FROM derpy_accounts ORDER BY id DESC LIMIT 20000",
          );
          for (const x of r.rows) {
            const forms = blockForms(String(x.username));
            const hit = words.find((w) =>
              forms.some((f) => f.includes(w.word)),
            );
            if (hit)
              flagged.push({
                id: Number(x.id),
                username: String(x.username),
                word: hit.word,
              });
          }
        }
        res.json({ words, flagged });
      },
    },
    {
      method: "post",
      path: "/names/block",
      handler: async (req, res, ctx) => {
        const body = WordBody.safeParse(req.body);
        const word = body.success ? blockWord(body.data.word) : null;
        if (word === null) {
          res.status(400).json({ error: "invalid_word" });
          return;
        }
        const r = await (
          await db()
        ).query(
          "INSERT INTO derpy_name_blocklist (word) VALUES ($1) ON CONFLICT DO NOTHING",
          [word],
        );
        if ((r.rowCount ?? 0) > 0)
          await ctx.audit({
            action: "names.block",
            target: { type: "word", id: word, name: word },
          });
        res.json({ words: await blocklist() });
      },
    },
    {
      method: "post",
      path: "/names/unblock",
      handler: async (req, res, ctx) => {
        const body = WordBody.safeParse(req.body);
        const word = body.success ? blockWord(body.data.word) : null;
        if (word === null) {
          res.status(400).json({ error: "invalid_word" });
          return;
        }
        const r = await (
          await db()
        ).query("DELETE FROM derpy_name_blocklist WHERE word = $1", [word]);
        if ((r.rowCount ?? 0) > 0)
          await ctx.audit({
            action: "names.unblock",
            target: { type: "word", id: word, name: word },
          });
        res.json({ words: await blocklist() });
      },
    },
  ],
  overview: async () => {
    const r = await (
      await db()
    ).query("SELECT count(*)::int AS n FROM derpy_name_blocklist");
    return [
      {
        label: "Blocked words in names",
        value: r.rows[0].n,
        href: "/admin/moderation",
      },
    ];
  },
});
