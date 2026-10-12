// SEA (r15): to sea in person, the trades that travel, the privateering
// company and the hurricanes. Game.ts imports this once; each module
// registers its own hooks (daily rounds, commands, the tracker, forecasts)
// when it loads, in this order: the storms first (the ships at sea answer
// them), then the cruises, the voyages and the privateering company.

import "./Storms";
import "./Cruises";
import "./Voyages";
import "./Privateers";
