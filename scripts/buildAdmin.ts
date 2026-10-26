// ADMIN (r26): the production build's last step: the owner's admin page's
// script, bundled into dist-admin/ (outside static/, so it's never one of
// the site's public files). The server sends it only to the owner.
//
//   tsx scripts/buildAdmin.ts

import { ADMIN_DIST, writeAdminBundle } from "../src/server/derpy/admin/AdminBundle";

const b = await writeAdminBundle();
console.log(
  `admin page: ${ADMIN_DIST}/app-${b.hash}.js (${Math.round(b.js.length / 1024)} KB)`,
);
