// CHAMBER (r16): the track's modules, loaded with the game. The council's
// wider business (Docket.ts), a seat's work that comes to something later
// (Later.ts), the assembly's yearly session and its scene (Session.ts,
// SessionEvents.ts), and the factions' memory fading each January.

import { dateOf } from "./Calendar";
import "./Docket";
import { fadeFactions } from "./Factions";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import "./Later";
import { POWER_DEFAULTS, POWER_EVENTS } from "./PowerEvents";
import "./Session";
import { SESSION_DEFAULTS, SESSION_EVENTS } from "./SessionEvents";

// The session's scene joins the council's (looked up when first raised).
for (const d of SESSION_EVENTS)
  if (!POWER_EVENTS.some((x) => x.key === d.key)) POWER_EVENTS.push(d);
Object.assign(POWER_DEFAULTS, SESSION_DEFAULTS);

/** Each January the factions' memories fade by a fifth. */
function chamberYear(g: ConquestGame): void {
  if (dateOf(g.s.day).month !== 0) return;
  for (const cab of Object.values(g.s.power?.cabinets ?? {}))
    if (cab.stand) fadeFactions(g, cab);
}

hooks.monthStart.push(chamberYear);
