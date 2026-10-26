// PROFILE (r26): profile pictures on the admin page: Moderation's Pictures
// and Reports tabs, and a panel on each account's page. The elements are
// in PicturesView.ts; the server's half is admin/sections/Pictures.ts.

import { html } from "lit";
import { registerAccountPanel, registerSection } from "../Registry";
import { pictureAccountPanel } from "./PicturesView";

registerSection({
  id: "pictures",
  label: "Profile pictures",
  order: 10,
  parent: "moderation",
  render: (view) => html`<adm-pictures .view=${view}></adm-pictures>`,
});

registerSection({
  id: "reports",
  label: "Reported pictures",
  order: 20, // ADMIN (r26): Usernames come after, at 30
  parent: "moderation",
  render: (view) =>
    html`<adm-picture-reports .view=${view}></adm-picture-reports>`,
});

registerAccountPanel({
  id: "pictures",
  label: "Picture",
  order: 10,
  render: (account, data, view, reload) =>
    pictureAccountPanel(account, data, view, reload),
});
