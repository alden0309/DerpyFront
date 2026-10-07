// The Derpy Conquest map: the 1600s Americas, built by
// scripts/conquest/build-map.mjs from Natural Earth data.

import americas from "../data/americas.json";
import { MapDef } from "./Types";

export const AMERICAS: MapDef = americas as unknown as MapDef;
