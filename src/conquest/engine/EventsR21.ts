// EVENTS (r21): every event the round adds, gathered for LifeEvents.ts:
// what happens in a place (the tavern, home, the docks, the church, the
// market, the fields, the woods, the governor's house, the workshops, the
// printing house, the apothecary, the fort, a native town and its council
// fire, open country, and to a stranger abroad), each saying where it can
// come (EventPlaces.ts). A trade's new matters at work join the others in
// Matters.ts (MattersR21.ts).

import "./EventPlaces";
import { LAND_PLACE_EVENTS } from "./EventsR21Land";
import { TOWN_PLACE_EVENTS } from "./EventsR21Town";
import type { LifeEventDef } from "./LifeEvents";

export const R21_EVENTS: LifeEventDef[] = [
  ...TOWN_PLACE_EVENTS,
  ...LAND_PLACE_EVENTS,
];
