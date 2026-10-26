// ADMIN (r26): the site banner: text, an optional link, an optional end
// time, on or off. Saved in the database, served from memory (SiteBanner.ts)
// on the beat and What's New's list, so every page with the top bar shows
// it within about 15 seconds.

import { z } from "zod";
import {
  BANNER_LINK_RE,
  BANNER_LINK_TEXT_MAX,
  BANNER_TEXT_MAX,
} from "../../../../derpland/BannerTypes";
import { inTransaction } from "../../DerpyDb";
import {
  bannerSetting,
  saveBanner,
  siteBanner,
  useBanner,
  type BannerSetting,
} from "../../SiteBanner";
import { adminSection } from "../AdminRegistry";

const BannerBody = z.object({
  enabled: z.boolean(),
  text: z.string().trim().max(BANNER_TEXT_MAX),
  link: z
    .string()
    .trim()
    .max(400)
    .refine((s) => s === "" || BANNER_LINK_RE.test(s))
    .optional(),
  linkText: z.string().trim().max(BANNER_LINK_TEXT_MAX).optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
});

const view = (b: BannerSetting) => ({
  enabled: b.enabled,
  text: b.text,
  link: b.link,
  linkText: b.linkText,
  endsAt: b.endsAt === null ? null : new Date(b.endsAt).toISOString(),
  version: b.version,
  updatedAt: b.updatedAt,
});

export const bannerSection = adminSection({
  id: "banner",
  routes: [
    {
      method: "get",
      path: "/",
      handler: async (_req, res) => {
        res.json({
          setting: view(await bannerSetting()),
          showing: siteBanner(),
        });
      },
    },
    {
      method: "post",
      path: "/",
      handler: async (req, res, ctx) => {
        const body = BannerBody.safeParse(req.body);
        if (!body.success) {
          res.status(400).json({ error: "invalid" });
          return;
        }
        const b = body.data;
        if (b.enabled && !b.text) {
          res.status(400).json({ error: "no_text" });
          return;
        }
        const endsAt = b.endsAt ? Date.parse(b.endsAt) : null;
        if (b.enabled && endsAt !== null && endsAt <= Date.now()) {
          res.status(400).json({ error: "ends_in_past" });
          return;
        }
        const saved = await inTransaction(async (c) => {
          const before = await bannerSetting(c);
          const after = await saveBanner(c, {
            enabled: b.enabled,
            text: b.text,
            link: b.link?.length ? b.link : null,
            linkText: b.link?.length && b.linkText?.length ? b.linkText : null,
            endsAt,
          });
          await ctx.audit(
            {
              action: b.enabled ? "banner.set" : "banner.off",
              target: {
                type: "banner",
                id: 1,
                name: b.text.slice(0, 80) || null,
              },
              before: view(before),
              after: view(after),
            },
            c,
          );
          return after;
        });
        useBanner(saved);
        res.json({ setting: view(saved), showing: siteBanner() });
      },
    },
  ],
  overview: async () => {
    const s = siteBanner();
    return [
      {
        label: "Site banner",
        value: s ? "On" : "Off",
        ...(s
          ? { detail: s.text.length > 40 ? `${s.text.slice(0, 40)}…` : s.text }
          : {}),
        href: "/admin/banner",
      },
    ];
  },
});
