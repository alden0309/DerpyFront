// EVENTS (r15): every event the round adds, gathered for LifeEvents.ts: a
// trade's many matters at work, a rogue's big jobs and a lawman's rounds
// (Matters.ts), and a great many more things that happen in a life
// (LifeR15*.ts). Loading it also sets the pace of events (EventPacing.ts).

import "./EventPacing";
import type { LifeEventDef } from "./LifeEvents";
import { MATTER_EVENTS } from "./Matters";

export const R15_EVENTS: LifeEventDef[] = [...MATTER_EVENTS];
