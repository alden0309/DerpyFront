// EVENTS (r15): every event the round adds, gathered for LifeEvents.ts: a
// trade's many matters at work, a rogue's big jobs and a lawman's rounds
// (Matters.ts), and a great many more things that happen in a life: its
// times and its family (LifeR15Family.ts), the town, the port and your
// station (LifeR15Town.ts), the frontier, the peoples' own life, the
// weather, the road and the sea (LifeR15Wild.ts). Loading it also sets the
// pace of events (EventPacing.ts).

import "./EventPacing";
import type { LifeEventDef } from "./LifeEvents";
import { FAMILY_EVENTS } from "./LifeR15Family";
import { TOWN_EVENTS } from "./LifeR15Town";
import { WILD_EVENTS } from "./LifeR15Wild";
import { MATTER_EVENTS } from "./Matters";

/** The new events drawn day by day (at home, on the road, at sea). */
export const DRAWN_R15: LifeEventDef[] = [
  ...FAMILY_EVENTS,
  ...TOWN_EVENTS,
  ...WILD_EVENTS,
];

export const R15_EVENTS: LifeEventDef[] = [...MATTER_EVENTS, ...DRAWN_R15];
