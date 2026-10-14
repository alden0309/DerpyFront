// EVENTS (r21): the round's new matters at work, gathered for Matters.ts:
// six more to every honest trade (town, sea and colours, woods and the
// peoples), three more big jobs to every crooked trade, and five more rounds
// for the watch and the thief-takers.

import type { Variant } from "./MatterKit";
import { SEA_MATTERS_R21 } from "./MattersR21Sea";
import { TOWN_MATTERS_R21 } from "./MattersR21Town";
import { WILD_MATTERS_R21 } from "./MattersR21Wild";

export const R21_MATTERS: Variant[] = [
  ...TOWN_MATTERS_R21,
  ...SEA_MATTERS_R21,
  ...WILD_MATTERS_R21,
];
