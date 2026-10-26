// PROFILE (r26): profile pictures on the admin page, server side: two
// sections under Moderation. "pictures": the latest uploads, removing one
// (at once, everywhere; with or without blocking the account's uploads),
// and blocking or allowing an account's uploads; its panel on each
// account's page; its lines on the Overview. "reports": the pictures
// someone reported, and keeping one (its reports go). The work is done in
// DerpyPictures.ts, which writes each audit line inside the change's own
// transaction through ctx.audit. The page's half: src/admin/sections/
// Pictures.ts and PicturesView.ts.

import { z } from "zod";
import { VERSION_RE } from "../../../../derpland/Pictures";
import {
  accountPicture,
  blockUploads,
  dismissReports,
  moderationView,
  picturesOverview,
  removePicture,
} from "../../DerpyPictures";
import { adminSection, idParam, type AdminCtx } from "../AdminRegistry";

const Reason = z.string().max(500).nullish();
const RemoveBody = z.object({ block: z.boolean().optional(), reason: Reason });
const BlockBody = z.object({ blocked: z.boolean(), reason: Reason });
const DismissBody = z.object({
  version: z.string().regex(VERSION_RE),
  reason: Reason,
});

const auditIn = (ctx: AdminCtx) => ctx.audit.bind(ctx);

async function picturesPage() {
  const v = await moderationView();
  return { recent: v.recent, blocked: v.blocked, reported: v.reported };
}

export const picturesSection = adminSection({
  id: "pictures",
  routes: [
    {
      method: "get",
      path: "/",
      handler: async (_req, res) => {
        res.json(await picturesPage());
      },
    },
    {
      method: "post",
      path: "/:id/remove",
      fresh: true,
      handler: async (req, res, ctx) => {
        const id = idParam(req);
        const body = RemoveBody.safeParse(req.body ?? {});
        if (id === null || !body.success) {
          res.status(400).json({ error: "invalid" });
          return;
        }
        const r = await removePicture(id, {
          block: body.data.block === true,
          reason: body.data.reason,
          audit: auditIn(ctx),
        });
        if ("error" in r) {
          res.status(404).json({ error: r.error });
          return;
        }
        res.json(await picturesPage());
      },
    },
    {
      method: "post",
      path: "/:id/block",
      // Blocking takes something away: a fresh sign-in. Allowing doesn't.
      fresh: (b) => (b as { blocked?: unknown } | null)?.blocked === true,
      handler: async (req, res, ctx) => {
        const id = idParam(req);
        const body = BlockBody.safeParse(req.body ?? {});
        if (id === null || !body.success) {
          res.status(400).json({ error: "invalid" });
          return;
        }
        const r = await blockUploads(id, {
          blocked: body.data.blocked,
          reason: body.data.reason,
          audit: auditIn(ctx),
        });
        if ("error" in r) {
          res.status(404).json({ error: r.error });
          return;
        }
        res.json(await picturesPage());
      },
    },
  ],
  account: (accountId) => accountPicture(accountId),
  overview: () => picturesOverview(),
});

export const reportsSection = adminSection({
  id: "reports",
  routes: [
    {
      method: "get",
      path: "/",
      handler: async (_req, res) => {
        res.json({ reported: (await moderationView()).reported });
      },
    },
    {
      method: "post",
      path: "/:id/dismiss",
      handler: async (req, res, ctx) => {
        const id = idParam(req);
        const body = DismissBody.safeParse(req.body ?? {});
        if (id === null || !body.success) {
          res.status(400).json({ error: "invalid" });
          return;
        }
        await dismissReports(id, body.data.version, {
          reason: body.data.reason,
          audit: auditIn(ctx),
        });
        res.json({ reported: (await moderationView()).reported });
      },
    },
  ],
});
