// ADMIN (r26): What's New, read-only (entries are written through Claude,
// as the owner decided): every entry, Mr. Based's too, and how many
// accounts haven't seen each yet. An account's mark is the newest entry it
// has seen, so an entry is unseen by every account whose mark is older.
// Accounts that have never looked aren't counted (their first look marks
// everything out then as seen).

import { newerMark, NEWS_NOTHING } from "../../../../derpland/NewsTypes";
import { db } from "../../DerpyDb";
import { newsForAdmin } from "../../DerpyNews";
import { adminSection } from "../AdminRegistry";

export const newsSection = adminSection({
  id: "news",
  routes: [
    {
      method: "get",
      path: "/",
      handler: async (_req, res) => {
        const { entries, order, games } = newsForAdmin();
        const secret = new Set(games.filter((g) => g.secret).map((g) => g.id));
        const r = await (
          await db()
        ).query(
          `SELECT news_seen, based_access, count(*)::int AS n
           FROM derpy_accounts GROUP BY news_seen, based_access`,
        );
        let looked = 0;
        let never = 0;
        let lookedBased = 0;
        for (const x of r.rows) {
          if (x.news_seen === null) never += x.n;
          else {
            looked += x.n;
            if (x.based_access) lookedBased += x.n;
          }
        }
        res.json({
          games,
          looked,
          never,
          entries: entries.map((e) => {
            const forBased = secret.has(e.game);
            let unseen = 0;
            for (const x of r.rows) {
              if (x.news_seen === null) continue;
              if (forBased && !x.based_access) continue;
              const mark = String(x.news_seen);
              if (mark === NEWS_NOTHING || newerMark(e.id, mark, order))
                unseen += x.n;
            }
            const audience = forBased ? lookedBased : looked;
            return { ...e, unseen, seen: audience - unseen, audience };
          }),
        });
      },
    },
  ],
});
