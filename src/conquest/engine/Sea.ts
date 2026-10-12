// SEA (r15): to sea in person, the trades that travel, the privateering
// company and the hurricanes. Game.ts imports this once (and the client's
// sea page, for the forecast's and the tracker's hooks); it registers each
// module's hooks (daily rounds, commands, the tracker, forecasts) in this
// order: the storms first (the ships at sea answer them), then the cruises,
// the voyages and the privateering company.

import { registerCruises } from "./Cruises";
import { registerPrivateers } from "./Privateers";
import { registerStorms } from "./Storms";
import { registerVoyages } from "./Voyages";

// Once every one of them has loaded (they import each other): the storms'
// hooks first, so a ship at sea answers a storm before the day's sailing.
registerStorms();
registerCruises();
registerVoyages();
registerPrivateers();
