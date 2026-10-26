// ADMIN (r26): the audit log, filterable (words, an action or a whole
// area, one target) and paged.

import { auditActions, auditPage } from "../AdminAudit";
import { adminSection } from "../AdminRegistry";

const str = (v: unknown, max = 60) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

export const auditSection = adminSection({
  id: "audit",
  routes: [
    {
      method: "get",
      path: "/",
      handler: async (req, res) => {
        const page = Number(req.query.page);
        const [result, actions] = await Promise.all([
          auditPage({
            q: str(req.query.q),
            action: str(req.query.action),
            targetType: str(req.query.targetType, 20),
            targetId: str(req.query.targetId, 40),
            page: Number.isInteger(page) && page > 0 ? page : 1,
          }),
          auditActions(),
        ]);
        res.json({ ...result, actions });
      },
    },
  ],
});
