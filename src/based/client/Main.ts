// Mr. Based's page (/based). The story itself is never in this bundle: the
// page asks the server whether the visitor may play, and fetches each
// chapter from it only if so.

import "../../derpland/fonts";
import "./App";
import "./based.css";

document.body.appendChild(document.createElement("based-app"));
