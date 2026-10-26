// ADMIN (r26): the admin page's sections, server side, in order. A new
// section is a file exporting adminSection({...}) (AdminRegistry.ts) and
// one line here; the page's half registers itself in src/admin/sections/.

import type { AdminServerSection } from "../AdminRegistry";
import { accounts } from "./Accounts";
import { auditSection } from "./Audit";
import { bannerSection } from "./Banner";
import { challenges } from "./Challenges";
import { economy } from "./Economy";
import { games } from "./Games";
import { moderation } from "./Moderation";
import { newsSection } from "./News";
import { overviewSection } from "./Overview";

export const ADMIN_SECTIONS: readonly AdminServerSection[] = [
  overviewSection,
  accounts,
  moderation,
  games,
  economy,
  challenges,
  newsSection,
  bannerSection,
  auditSection,
];
