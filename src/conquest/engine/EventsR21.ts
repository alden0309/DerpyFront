// EVENTS (r21): every event the round adds, gathered for LifeEvents.ts:
// what happens in a place (the tavern, home, the docks, the church, the
// market, the fields, the woods, the governor's house, the workshops, the
// printing house, the apothecary, the fort, a native town and its council
// fire, open country, and to a stranger abroad), each saying where it can
// come (EventPlaces.ts); and an invitation to another player's card table
// (vingt-et-un, VingtEtUn.ts). A trade's new matters at work join the
// others in Matters.ts (MattersR21.ts).

import { registerFamily } from "./EventPacing";
import { VENTURE_REST } from "./EventPlaces";
import { LAND_PLACE_EVENTS } from "./EventsR21Land";
import { TOWN_PLACE_EVENTS } from "./EventsR21Town";
import type { LifeEventDef } from "./LifeEvents";
import { CARDS_EVENTS } from "./VingtEtUn";

// The merchant's venture in person rests with the venture by letter: a share
// at twenty coins comes at most once in three years, either way.
registerFamily("share-venture", ["merchant-venture"], VENTURE_REST);

export const R21_EVENTS: LifeEventDef[] = [
  ...TOWN_PLACE_EVENTS,
  ...LAND_PLACE_EVENTS,
  ...CARDS_EVENTS, // vingt-et-un: an invitation to another player's table
];
