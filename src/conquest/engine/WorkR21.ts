// WORK (r21): the round's work, gathered: leaving your work from anywhere
// (Notice.ts), a business's staff by name (Staff.ts), partnership buyouts and
// sales by offer (Buyouts.ts), and the work itself: duties by rung, the people
// you work beside, your master's requests (Duties.ts). Game.ts loads this so
// each registers its commands, hooks and outfits; LifeEvents asks it for the
// scenes.

import { bidEvents, bidQuiet } from "./Buyouts";
import type { LifeEventDef } from "./LifeEvents";
import "./Notice";
import { staffEvents, staffQuiet } from "./Staff";

/** Every scene of the round's work (each module's own, added once). */
export function workR21Events(): LifeEventDef[] {
  return [...staffEvents(), ...bidEvents()];
}

/** What each scene does left unanswered (its quiet choice). */
export function workR21Quiet(): Record<string, number> {
  return { ...staffQuiet(), ...bidQuiet() };
}
