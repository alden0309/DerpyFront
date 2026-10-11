// Derpy Conquest (MAP r12): works out the harbours and sea lanes the map's
// boats sail by, from the chart's own shapes, and writes
// src/conquest/data/americas-sea.json. Run it again whenever the map is
// rebuilt (build-map.mjs):
//
//   npx tsx scripts/conquest/build-sea.mjs

import fs from "node:fs";
import path from "node:path";
import { buildSeaData } from "../../src/conquest/client/SeaBuild.ts";

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);
const DATA = path.join(ROOT, "src/conquest/data");
const geo = JSON.parse(
  fs.readFileSync(path.join(DATA, "americas-geo.json"), "utf8"),
);
const map = JSON.parse(
  fs.readFileSync(path.join(DATA, "americas.json"), "utf8"),
);
const t0 = Date.now();
const data = buildSeaData(geo, map.provinces, (s) =>
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`),
);
const out = path.join(DATA, "americas-sea.json");
fs.writeFileSync(out, JSON.stringify(data));
console.log(`wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
