// ADMIN (r26): Economy. The coin ledger (Ledger.ts: payouts, purchases and
// coins given by hand, filterable by kind and account), totals per day,
// and the store's catalog as it stands: prices (set in DerpyCatalog.ts, so
// changed by asking Claude) and how many accounts own each item.

import { DERPY_ITEMS, DERPY_STORE_TABS } from "../../DerpyCatalog";
import { db } from "../../DerpyDb";
import { adminSection } from "../AdminRegistry";
import {
  dailyTotals,
  ledger,
  LEDGER_KIND_NAMES,
  LEDGER_KINDS,
  type LedgerKind,
} from "../Ledger";

export const economy = adminSection({
  id: "economy",
  routes: [
    {
      method: "get",
      path: "/ledger",
      handler: async (req, res) => {
        const kinds = String(req.query.kind ?? "")
          .split(",")
          .filter((k): k is LedgerKind =>
            (LEDGER_KINDS as readonly string[]).includes(k),
          );
        const name = String(req.query.account ?? "")
          .trim()
          .toLowerCase();
        let accountId: number | undefined;
        if (name) {
          const r = await (
            await db()
          ).query(
            "SELECT id FROM derpy_accounts WHERE username_key = $1 OR id::text = $1",
            [name.replace(/^#/, "")],
          );
          if (!r.rows[0]) {
            res.json({ rows: [], kinds: LEDGER_KIND_NAMES, account: null });
            return;
          }
          accountId = Number(r.rows[0].id);
        }
        const before = String(req.query.before ?? "");
        const rows = await ledger({
          kinds,
          accountId,
          before: Number.isNaN(Date.parse(before)) ? undefined : before,
          limit: 100,
        });
        res.json({ rows, kinds: LEDGER_KIND_NAMES, account: accountId ?? null });
      },
    },
    {
      method: "get",
      path: "/days",
      handler: async (_req, res) => {
        const r = await (
          await db()
        ).query("SELECT coalesce(sum(coins), 0)::bigint AS coins FROM derpy_accounts");
        res.json({
          days: await dailyTotals(30),
          inAccounts: Number(r.rows[0].coins),
        });
      },
    },
    {
      method: "get",
      path: "/catalog",
      handler: async (_req, res) => {
        const r = await (
          await db()
        ).query(
          `SELECT item, count(*)::int AS owners,
             count(*) FILTER (WHERE granted)::int AS given
           FROM derpy_owned WHERE item LIKE 'pack:%' GROUP BY item`,
        );
        const owners = new Map(
          r.rows.map((x) => [String(x.item), { owners: x.owners, given: x.given }]),
        );
        res.json({
          tabs: DERPY_STORE_TABS.map((t) => ({
            game: t.game,
            label: t.label,
            categories: t.categories.map((c) => ({ id: c.id, label: c.label })),
          })),
          items: DERPY_ITEMS.map((i) => ({
            name: i.name,
            label: i.displayName,
            game: i.game,
            category: i.category,
            price: i.price,
            owners: owners.get(`pack:${i.name}`)?.owners ?? 0,
            given: owners.get(`pack:${i.name}`)?.given ?? 0,
          })),
        });
      },
    },
  ],
});
