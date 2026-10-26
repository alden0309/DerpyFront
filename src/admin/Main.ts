// ADMIN (r26): the admin page's script. Built into dist-admin/ (never the
// site's static/), sent by the server only to the owner's browser
// (src/server/derpy/admin/AdminPage.ts). The page around it is Derp Land's
// own shell, so the hub's stylesheet, fonts and top bar look as everywhere.

import "../derpland/DerpBar";
import "./App";
import "./sections";
import { ADMIN_CSS } from "./styles";

const style = document.createElement("style");
style.textContent = ADMIN_CSS;
document.head.append(style);

const root = document.createElement("derp-land");
root.innerHTML = `<derp-bar page="account"></derp-bar>
  <main class="dl-main adm-main"><dl-admin></dl-admin></main>`;
document.body.append(root);
