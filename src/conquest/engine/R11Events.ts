// LIFE (r11): every event the round-11 life adds, gathered for LifeEvents.ts:
// matters at work, crime and the law, contracts, and the road.

import { CONTRACT_EVENTS } from "./Contracts";
import { CRIME_EVENTS } from "./CrimeEvents";
import type { LifeEventDef } from "./LifeEvents";
import { TRAVEL_EVENTS } from "./TravelEvents";
import { WORK_EVENTS } from "./WorkEvents";

export const R11_EVENTS: LifeEventDef[] = [
  ...WORK_EVENTS,
  ...CRIME_EVENTS,
  ...CONTRACT_EVENTS,
  ...TRAVEL_EVENTS,
];
