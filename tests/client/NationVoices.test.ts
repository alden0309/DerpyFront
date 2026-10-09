import { GameMapType } from "@openfront/engine-api/game/Maps.gen";
import { censorChatText } from "@openfront/shared/Profanity";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  CHATTER_EVENTS,
  TEMPLATES,
} from "../../src/client/chat/ChatterTemplates";
import {
  ChatterRng,
  composeLine,
  mentionKind,
} from "../../src/client/chat/NationChatter";
import { voiceFor } from "../../src/client/chat/NationCulture";
import { GENERIC_KIT, VOICES } from "../../src/client/chat/NationVoices";

const MAPS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../map-generator/assets/maps",
);

interface MapNation {
  map: string;
  type: string;
  name: string;
  flag: string | null;
}

function allNations(): MapNation[] {
  const out: MapNation[] = [];
  for (const dir of fs.readdirSync(MAPS)) {
    const file = path.join(MAPS, dir, "info.json");
    if (!fs.existsSync(file)) continue;
    const info = JSON.parse(fs.readFileSync(file, "utf8"));
    const type =
      (GameMapType as Record<string, string>)[info.id] ?? String(info.name);
    for (const n of info.nations ?? []) {
      out.push({ map: dir, type, name: n.name, flag: n.flag ?? null });
    }
  }
  return out;
}

describe("which voice a nation speaks with", () => {
  test.each([
    ["Germany", "de", GameMapType.World, "german"],
    ["France", "fr", GameMapType.World, "french"],
    ["Japan", "jp", GameMapType.World, "japanese"],
    ["Nigeria", "ng", GameMapType.World, "nigerian"],
    ["Brazil", "br", GameMapType.World, "brazilian"],
    ["Bavaria", "DE-BY-L", GameMapType.World, "german"],
    ["Moscow", "RU-MOW", GameMapType.World, "russian"],
    ["Virginia", "Virginia", GameMapType.ThirteenColonies, "colonial"],
    ["Virginia", "Virginia", GameMapType.UnitedStates, "us_south"],
    ["Texas", "Texas", GameMapType.UnitedStates, "us_southwest"],
    [
      "Tsalagi (Cherokee)",
      "Cherokee Nation",
      GameMapType.ThirteenColonies,
      "native",
    ],
    [
      "Yat'siminoli (Seminole)",
      "Seminole",
      GameMapType.ThirteenColoniesDetailed,
      "native",
    ],
    ["Winter Park", "Florida", GameMapType.OrlandoDetailed, "orlando"],
    ["Tallahassee", "Florida", GameMapType.FloridaDetailed, "florida"],
    ["Downtown Orlando", "Orlando", GameMapType.Orlando, "orlando"],
    ["Apopka", "Florida", GameMapType.FloridaDetailed, "apopka"],
    ["Kit Land Nelson Park", "Apopka", GameMapType.ApopkaDetailed, "apopka"],
    ["Wekiwa Springs", "Florida", GameMapType.ApopkaDetailed, "apopka"],
    [
      "Georgetown",
      "District_of_Columbia",
      GameMapType.WashingtonDCDetailed,
      "us_dc",
    ],
    ["Olympus", "mars", GameMapType.Mars, "space"],
    ["Wessex", "1_Wessex", GameMapType.Britannia, "medieval"],
    ["Munster", "1_Munster", GameMapType.Britannia, "irish"],
    [
      "Republic of Pirates",
      "Republic of Pirates",
      GameMapType.Caribbean,
      "pirate",
    ],
    ["Somewhere", null, GameMapType.Labyrinth, "generic"],
  ])("%s (%s) on %s speaks %s", (name, flag, map, voice) => {
    expect(voiceFor(name, flag, map)).toBe(voice);
  });

  test("every voice a nation can get exists", () => {
    for (const n of allNations()) {
      const v = voiceFor(n.name, n.flag, n.type);
      expect(VOICES[v], `${n.map}: ${n.name} -> ${v}`).toBeDefined();
    }
  });

  test("every nation on the world maps has a culture of its own", () => {
    const world = allNations().filter((n) =>
      ["world", "giantworldmap", "europe", "asia", "africa"].includes(n.map),
    );
    expect(world.length).toBeGreaterThan(100);
    const generic = world.filter(
      (n) => voiceFor(n.name, n.flag, n.type) === "generic",
    );
    expect(generic.map((n) => `${n.map}: ${n.name}`)).toEqual([]);
  });

  test("nearly every nation on every map does", () => {
    const all = allNations();
    const generic = all.filter(
      (n) => voiceFor(n.name, n.flag, n.type) === "generic",
    );
    // What's left is fictional maps (Labyrinth, The Box, the tourney maps),
    // which speak the generic voice on purpose.
    expect(generic.length / all.length).toBeLessThan(0.1);
  });

  test("the custom maps' nations are all covered", () => {
    const custom = allNations().filter((n) =>
      [
        "floridadetailed",
        "orlando",
        "orlandodetailed",
        "apopkadetailed",
        "unitedstates",
        "thirteencolonies",
        "thirteencoloniesdetailed",
        "washingtondcdetailed",
      ].includes(n.map),
    );
    for (const n of custom) {
      expect(voiceFor(n.name, n.flag, n.type), `${n.map}: ${n.name}`).not.toBe(
        "generic",
      );
    }
  });
});

describe("what the nations say", () => {
  test("every voice can say everything, slots filled, briefly", () => {
    const rng = new ChatterRng(12345);
    for (const voice of Object.keys(VOICES)) {
      for (const event of CHATTER_EVENTS) {
        for (const withName of [true, false]) {
          for (let i = 0; i < 6; i++) {
            const line = composeLine(voice, event, rng, withName);
            if (line === "") {
              // Only possible when every line for the event names someone.
              expect(withName).toBe(false);
              continue;
            }
            expect(line).not.toMatch(/\{(?!name\})/);
            if (!withName) expect(line).not.toContain("{name}");
            expect(line.length).toBeLessThanOrEqual(200);
          }
        }
      }
    }
  });

  test("a voice's own words turn up in its lines", () => {
    const rng = new ChatterRng(7);
    const said = new Set<string>();
    for (let i = 0; i < 300; i++) {
      said.add(composeLine("german", "allianceAccepted", rng, true));
    }
    const text = [...said].join(" ");
    expect(text).toMatch(
      /Wunderbar|Ja|Genau|Natürlich|Klar|Danke|Freund|Prost/,
    );
  });

  test("it doesn't repeat itself straight away", () => {
    const rng = new ChatterRng(99);
    const recent: string[] = [];
    const lines = Array.from({ length: 6 }, () =>
      composeLine("french", "idle", rng, false, recent),
    );
    // Six lines in a row, at most one template reused.
    expect(new Set(lines).size).toBeGreaterThanOrEqual(5);
  });

  test("nothing they say trips the profanity filter", () => {
    const texts: string[] = [];
    for (const lines of Object.values(TEMPLATES)) texts.push(...lines);
    for (const kit of [GENERIC_KIT, ...Object.values(VOICES)]) {
      for (const [key, value] of Object.entries(kit)) {
        if (key === "lines") {
          for (const l of Object.values(value as Record<string, string[]>)) {
            texts.push(...l);
          }
        } else {
          texts.push(...(value as string[]));
        }
      }
    }
    expect(texts.length).toBeGreaterThan(1000);
    for (const t of texts) expect(censorChatText(t), t).toBe(t);
  });

  test("an answer fits what was said", () => {
    expect(mentionKind("hello Germany!")).toBe("mentionGreet");
    expect(mentionKind("Germany want to be allies?")).toBe("mentionAlly");
    expect(mentionKind("I'm coming for you France")).toBe("mentionThreat");
    expect(mentionKind("thanks Japan")).toBe("mentionThanks");
    expect(mentionKind("sorry Brazil, my bad")).toBe("mentionSorry");
    expect(mentionKind("Brazil what are you doing")).toBe("mention");
  });
});
