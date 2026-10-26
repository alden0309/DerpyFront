// BSTORY (r25): chapter one's opening as the owner reshaped it, played
// through: the smoker who wants to be alone, the lobby (the clerk, the
// guest book he keeps to himself, the lift that's out, the stairs roped
// until the room is ready), the man in grey and London's contact (both
// outcomes), sleep, the palace window, the end. Also the regulars, the
// sound, and saves made before.

import fs from "fs";
import path from "path";
import { describe, expect, test } from "vitest";
import {
  CUES,
  EFFECTS,
  LOOPS,
  SPRITES,
} from "../../src/based/client/SoundTable";
import { factsIn } from "../../src/based/engine/Facts";
import { PlaceDef } from "../../src/based/engine/Place";
import {
  Beat,
  chapterStart,
  Snapshot,
  StoryRun,
} from "../../src/based/engine/Runtime";
import { parseChapter } from "../../src/based/engine/Script";
import { buildOf } from "../../src/based/engine/Skills";
import { FREE, SOUND_CUES } from "../../src/based/engine/Types";
import { errorsOf, validateChapter } from "../../src/based/engine/Validate";
import { playRandomly } from "./play";

const ROOT = path.resolve(__dirname, "../..");
const PLACES: Record<string, PlaceDef> = Object.fromEntries(
  fs
    .readdirSync(path.join(ROOT, "src/based/places"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => [
      f.replace(/\.json$/, ""),
      JSON.parse(
        fs.readFileSync(path.join(ROOT, "src/based/places", f), "utf8"),
      ) as PlaceDef,
    ]),
);
const { chapter } = parseChapter(
  fs.readFileSync(path.join(ROOT, "src/based/story/chapter-01.story"), "utf8"),
);
const analyst = buildOf(chapter.archetypes[0]);

/** Everything said or narrated in a scene, as written. */
const text = (id: string) =>
  chapter.scenes[id].ops
    .flatMap((o) =>
      o.op === "line"
        ? [o.text, ...(o.levels ?? [])]
        : o.op === "choose"
          ? [o.prompt, ...o.options.map((x) => x.label)]
          : [],
    )
    .join("\n");

type Picks = Record<string, string | string[]>;

/**
 * Reads on: lines, cards and dice; a choice by `picks` (the option's id,
 * or the first of a list that's open), else the first open option without
 * a check; a room by looking at everything `look` lists (or all of it),
 * then leaving. Stops when `until` holds, or at the free world or the end.
 */
function readOn(
  r: StoryRun,
  picks: Picks = {},
  until: (b: Beat) => boolean = (b) => b.kind === "free" || b.kind === "end",
  look?: string[],
): Beat {
  for (let i = 0; i < 2000; i++) {
    const b = r.beat;
    if (until(b)) return b;
    if (b.kind === "free" || b.kind === "end") return b;
    if (b.kind === "line" || b.kind === "card" || b.kind === "roll") {
      r.advance();
    } else if (b.kind === "choice") {
      const open = b.options.filter(
        (o) => !o.check?.locked && o.needs?.met !== false,
      );
      const want = picks[b.id];
      const list = Array.isArray(want) ? want : want ? [want] : [];
      const pick =
        list.map((w) => open.find((o) => o.id === w)).find(Boolean) ??
        open.find((o) => !o.check) ??
        open[0];
      r.choose(pick.id);
    } else {
      const unseen = b.spots.filter(
        (s) => !s.seen && (!look || look.includes(s.id)),
      );
      const ready = b.deductions.filter(
        (d) => d.ready && !d.done && !d.check?.locked,
      );
      if (unseen.length > 0) r.examine(unseen[0].id);
      else if (ready.length > 0) r.deduce(ready[0].id);
      else r.leave();
    }
  }
  throw new Error("stuck");
}

/** A new game, free in the street, with the Analyst. */
function street(seed = 7, fr = 3): StoryRun {
  const r = new StoryRun(
    chapter,
    chapterStart(chapter, undefined, {
      // r26: his French (the language system), perfect unless said.
      build: { ...analyst, langPts: { fr, ru: 4 - fr } },
      seed,
    }),
  );
  readOn(r);
  return r;
}

/** What a talk with someone says, read through to the free world. */
function talkTo(r: StoryRun, who: string): string {
  const said: string[] = [];
  r.talk(who);
  for (let i = 0; i < 40 && r.beat.kind !== "free"; i++) {
    const b = r.beat;
    if (b.kind === "line") said.push(`${b.who ?? ""}: ${b.text}`);
    // No choice at all: it ends.
    expect(b.kind).not.toBe("choice");
    r.advance();
  }
  expect(r.beat.kind).toBe("free");
  return said.join("\n");
}

/** Into Le Vauban, a book of matches from the bowl, and back out. */
function getMatches(r: StoryRun): void {
  r.enterPlace("vauban", "vauban_door_in");
  readOn(r);
  r.look("matches");
  readOn(r);
  expect(r.has("matchbook")).toBe(true);
  r.enterPlace("street", "vauban_door_out");
  readOn(r);
}

describe("the opening, reshaped (r25)", () => {
  test("the smoker, with nothing to light it: a nod he doesn't return, no offer", () => {
    const r = street();
    expect(r.stage.place).toBe("street");
    expect(r.stage.actors.WATCHER?.at).toBe("watcher_spot");
    expect(r.has("matchbook")).toBe(false);
    const first = talkTo(r, "WATCHER");
    expect(first).toMatch(/unlit cigarette/);
    expect(first).toMatch(/nod/);
    expect(first).not.toMatch(/light\?|matches|lighter|help/i);
    expect(first).not.toMatch(/alone/);
    expect(r.flag("saw_watcher")).toBe(1);
    expect(r.flag("met_watcher")).toBe(0);
    // Again, still nothing to offer: he hasn't moved.
    const again = talkTo(r, "WATCHER");
    expect(r.history()).toContain("s:watcher_by");
    expect(again).not.toMatch(/light\?|matches/i);
    expect(r.flag("met_watcher")).toBe(0);
    expect(r.stage.actors.WATCHER?.at).toBe("watcher_spot");
  });

  test("the smoker, once he has matches: he offers a light; the man wants to be alone", () => {
    // Nothing first, then the bar's matches, then back to him.
    const r = street();
    talkTo(r, "WATCHER");
    getMatches(r);
    expect(r.flag("has_light")).toBe(1);
    const said = talkTo(r, "WATCHER");
    expect(said).toMatch(/still hadn't lit his cigarette/);
    expect(said).toMatch(/tore a match from Le Vauban's book/);
    expect(said).toMatch(/BASED: Need a light\?/);
    expect(said).not.toMatch(/The bar will have matches/);
    expect(said).toMatch(/I just want to be alone/);
    expect(r.flag("met_watcher")).toBe(1);
    // He stays where the story needs him, and keeps to himself after.
    expect(r.stage.actors.WATCHER?.at).toBe("watcher_spot");
    expect(talkTo(r, "WATCHER")).toMatch(/Alone, monsieur/);
    // Matches first: the offer the first time he goes up to him.
    const m = street(9);
    getMatches(m);
    const offer = talkTo(m, "WATCHER");
    expect(offer).toMatch(/a cigarette he hadn't lit/);
    expect(offer).toMatch(/BASED: Need a light\?/);
    expect(m.flag("saw_watcher")).toBe(0);
    expect(m.flag("met_watcher")).toBe(1);
    expect(m.flag("heard_alone")).toBe(1);
  });

  test("r26: what the smoker says is his French; with less than decent, he can ask in English", () => {
    for (const fr of [0, 1, 2, 3]) {
      const r = street(9, fr);
      getMatches(r);
      r.talk("WATCHER");
      const said: string[] = [];
      for (let i = 0; i < 40 && r.beat.kind !== "free"; i++) {
        const b = r.beat;
        if (b.kind === "line") said.push(b.text);
        if (b.kind === "choice") {
          // Only below decent French, and the English way through is there.
          expect(fr).toBeLessThan(2);
          const ask = b.options.find((o) => /English/.test(o.label));
          expect(ask, `French ${fr}`).toBeTruthy();
          r.choose(ask!.id);
          continue;
        }
        r.advance();
      }
      const text = said.join("\n");
      expect(text).toMatch(
        [
          /Non, merci\. Je veux juste être seul\./,
          /I just want to be single/,
          /I just want to be on my own/,
          /I just want to be alone/,
        ][fr],
      );
      // Whatever his French, asked in English he knows what the man wants.
      expect(r.flag("heard_alone"), `French ${fr}`).toBe(1);
    }
  });

  test("r26: he stands under the awning, clear of the pharmacy from the game camera", () => {
    // The owner: "Move the guy standing outside as it's hard to click him
    // instead of the pharmacy." Seen down the camera (World.ts: azimuth and
    // elevation, orthographic), his click column (0.32 m round, 1.75 m tall)
    // overlaps no hotspot's sphere, and the pharmacy's least of all.
    const street = PLACES.street;
    const az = (street.camera.azimuth * Math.PI) / 180;
    const el = (street.camera.elevation * Math.PI) / 180;
    const d = [
      Math.sin(az) * Math.cos(el),
      Math.sin(el),
      Math.cos(az) * Math.cos(el),
    ];
    const n = Math.hypot(d[2], d[0]);
    const right = [d[2] / n, 0, -d[0] / n];
    const up = [
      d[1] * right[2] - d[2] * right[1],
      d[2] * right[0] - d[0] * right[2],
      d[0] * right[1] - d[1] * right[0],
    ];
    const dot = (a: number[], b: number[]) =>
      a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const screen = (p: number[]) => [dot(p, right), dot(p, up)];
    const [x, z] = street.marks.watcher_spot.at;
    const [fx, fy] = screen([x, 0, z]);
    const [, hy] = screen([x, 1.75, z]);
    const box = { l: fx - 0.32, r: fx + 0.32, lo: fy - 0.19, hi: hy + 0.19 };
    const clear = (id: string) => {
      const h = street.hotspots[id];
      const [cx, cy] = screen(h.at);
      const dx = Math.max(box.l - cx, 0, cx - box.r);
      const dy = Math.max(box.lo - cy, 0, cy - box.hi);
      return Math.hypot(dx, dy) - (h.r ?? 0.35);
    };
    for (const id of Object.keys(street.hotspots)) {
      expect(clear(id), id).toBeGreaterThan(0.2);
    }
    expect(clear("pharmacy")).toBeGreaterThan(0.5);
    // Under the pharmacy's awning, out of the rain.
    const shop = street.items.find(
      (i) => i.kind === "shopfront" && (i as { cross?: boolean }).cross,
    ) as unknown as { at: number[]; w: number; awning: { depth: number } };
    expect(Math.abs(x - shop.at[0])).toBeLessThan(shop.w / 2);
    expect(z).toBeGreaterThan(shop.at[2] - shop.awning.depth);
    expect(z).toBeLessThan(shop.at[2]);
  });

  test("the offer is gated: the validator refuses it without a light", () => {
    expect(
      (chapter.facts ?? []).some(
        (f) =>
          f.flags.includes("has_light") && f.words.includes("Need a light"),
      ),
    ).toBe(true);
    const src = fs.readFileSync(
      path.join(ROOT, "src/based/story/chapter-01.story"),
      "utf8",
    );
    const trigger = "@on talk WATCHER once if has_light and has.matchbook";
    expect(src).toContain(trigger);
    const loose = parseChapter(
      src.replace(trigger, "@on talk WATCHER once"),
    ).chapter;
    expect(
      errorsOf(validateChapter(loose))
        .map((p) => p.message)
        .filter((m) => m.includes("has_light")),
    ).not.toEqual([]);
    expect(errorsOf(validateChapter(chapter)).map((p) => p.message)).toEqual(
      [],
    );
  });

  test("the whole of part one: the lobby, the stairs closed then opened, the man in grey, the contact, sleep, the window, the end", () => {
    const r = street();
    r.enterPlace("vauban", "lobby_in");
    readOn(r);
    // The clerk: he's early, the room isn't made up, the stairs are roped.
    expect(r.talk("PORTER")).not.toBeNull();
    expect(r.sceneId).toBe("clerk_first");
    readOn(r, { "clerk_ask#1": "nothing" });
    expect(r.flag("room_late")).toBe(1);
    expect(r.flag("has_room")).toBe(0);
    // The stairs: the rope stops him, for the reason the clerk gave.
    expect(r.look("stairs")).not.toBeNull();
    expect(r.sceneId).toBe("stairs_closed");
    expect(text("stairs_closed")).toMatch(
      /merci de vous adresser à la réception/,
    );
    readOn(r);
    expect(r.stage.place).toBe("vauban");
    // The lift is out: the button is dead, and it goes nowhere.
    expect(r.look("lift")).not.toBeNull();
    expect(text("lift")).toMatch(/nothing happened at all/);
    readOn(r);
    expect(r.stage.place).toBe("vauban");
    // The bar: the barman, then the man in grey sits beside him.
    r.talk("BARMAN");
    readOn(r, {}, (b) => r.sceneId === "talk" && b.kind === "line");
    expect(text("talk")).toMatch(
      /I know every face at this bar\. Yours is new\./,
    );
    // Read on to the contact, having noticed everything there was.
    readOn(
      r,
      { "stranger#1": "stay-where-you-are" },
      (b) => r.sceneId === "the_question" && b.kind === "choice",
    );
    expect(r.flag("delorme_gone")).toBe(1);
    readOn(r, { "the_question#1": "tell-her" });
    expect(r.flag("met_contact")).toBe(1);
    expect(r.free).toBe(true);
    // He's tired: the journal says bed, and the street's done for tonight.
    expect(r.tasks.find((t) => t.id === "sleep")?.done).toBe(false);
    expect(r.look("street_door")).not.toBeNull();
    readOn(r);
    expect(r.stage.place).toBe("vauban");
    // The clerk has his key, and unhooks the rope.
    r.talk("PORTER");
    expect(r.sceneId).toBe("clerk_ready");
    readOn(r);
    expect(r.flag("has_room")).toBe(1);
    expect(r.has("his_key")).toBe(true);
    expect(r.stage.props.stair_rope).toBe(false);
    expect(r.stage.props.stair_rope_down).toBe(true);
    // Now the stairs are a door: up to his room, where he sleeps.
    expect(r.look("stairs")).toBeNull();
    r.enterPlace("room", "room_in");
    expect(r.sceneId).toBe("room");
    readOn(r, {}, (b) => r.sceneId === "epilogue" && b.kind === "line");
    expect(r.stage.place).toBe("elysee");
    expect(r.stage.actors.PRESIDENT?.wear).toBe("suit_dark_smoking");
    expect(text("epilogue")).toMatch(/Two men at a tall window, smoking/);
    expect(readOn(r).kind).toBe("end");
    // The walk to the river is gone.
    expect(chapter.scenes.street).toBeUndefined();
    expect(chapter.scenes.street_end).toBeUndefined();
    expect(JSON.stringify(PLACES.street.hotspots)).not.toMatch(/river/i);
    for (const id of chapter.order) {
      expect(text(id), id).not.toMatch(/walked towards the river/);
    }
  });

  test("the man in grey doesn't know him: he talks to a new face", () => {
    // (He says the name back once he's given it, in "name": not before.)
    for (const id of ["stranger", "read_stranger", "talk", "goodbye"]) {
      for (const o of chapter.scenes[id].ops) {
        if (o.op === "line" && (o.who === "STRANGER" || o.who === "DELORME")) {
          expect(o.text, id).not.toMatch(/Based|Bah-ZAY|Langley|Vienna/);
        }
      }
    }
  });
});

describe("the barman's grandson's pin (r26)", () => {
  /**
   * Through the bar to the end of the man in grey, by option labels where
   * `want` names one, looking at his lapel; every text he's shown (lines,
   * options, the reasons on checks, deductions) collected.
   */
  function playBar(want: string[]): { r: StoryRun; shown: string[] } {
    const r = street(13);
    r.enterPlace("vauban", "vauban_door_in");
    readOn(r);
    r.talk("BARMAN");
    const shown: string[] = [];
    for (let i = 0; i < 3000 && r.sceneId !== "the_question"; i++) {
      const b = r.beat;
      if (b.kind === "free" || b.kind === "end") break;
      if (b.kind === "line") {
        shown.push(`${b.who ?? ""}: ${b.text}`);
        r.advance();
      } else if (b.kind === "card") r.advance();
      else if (b.kind === "roll") {
        shown.push(b.label, ...b.mods.map((m) => m.why));
        r.advance();
      } else if (b.kind === "choice") {
        const open = b.options.filter(
          (o) => !o.check?.locked && o.needs?.met !== false,
        );
        for (const o of open) {
          shown.push(o.label, ...(o.check?.mods ?? []).map((m) => m.why));
        }
        const pick =
          open.find((o) => want.includes(o.label)) ??
          open.find((o) => !o.check) ??
          open[0];
        r.choose(pick.id);
      } else {
        for (const d of b.deductions.filter((x) => x.ready)) {
          shown.push(d.label, ...(d.check?.mods ?? []).map((m) => m.why));
        }
        const next =
          b.spots.find((x) => !x.seen && x.id === "lapel") ??
          b.spots.find((x) => !x.seen);
        const ready = b.deductions.find(
          (d) => d.ready && !d.done && !d.check?.locked,
        );
        if (next) r.examine(next.id);
        else if (ready) r.deduce(ready.id);
        else r.leave();
      }
    }
    return { r, shown };
  }

  test("asked about the television but not the boy: no pin, and no link to the man in grey's", () => {
    const { r, shown } = playBar(["Ask about the television", "Let it go"]);
    const all = shown.join("\n");
    expect(all).toMatch(/My grandson joined his Volunteers in the spring\./);
    expect(r.flag("heard_grandson")).toBe(1);
    expect(r.flag("knows_oak")).toBe(0);
    expect(r.flag("lapel")).toBe(1);
    // The barman never said what the boy wears, so nothing of his says it:
    // that there's a grandson, yes; his pin, or that the man's is the same, no.
    const his = shown.filter(
      (t) => !/^(BARMAN|ANSELME|STRANGER|DELORME|PENHALLOW):/.test(t),
    );
    expect(his.join("\n")).not.toMatch(
      /grandson's pin|grandson wears|grandmother|inside of the lapel/i,
    );
    expect(all).not.toMatch(/little pin|inside of his lapel/);
  });

  test("asked about the boy: the pin, and then the man in grey's is the same", () => {
    const { r, shown } = playBar([
      "Ask about the television",
      "Ask about his grandson",
    ]);
    const all = shown.join("\n");
    expect(all).toMatch(/They give them a little pin/);
    expect(r.flag("knows_oak")).toBe(1);
    expect(all).toMatch(/The barman's grandson wears one of those/);
  });

  test("let him watch: nothing of the boy at all", () => {
    const { r, shown } = playBar(["Let him watch"]);
    expect(r.flag("heard_grandson")).toBe(0);
    expect(r.flag("knows_oak")).toBe(0);
    expect(shown.join("\n")).not.toMatch(/grandson|grandmother/i);
  });
});

/** To the contact's question, having looked at what `look` lists. */
function toQuestion(look: string[], picks: Picks = {}): StoryRun {
  const r = street(11);
  r.enterPlace("vauban", "vauban_door_in");
  readOn(r);
  r.talk("BARMAN");
  // Every passive deduction left unmade: only what he looks at.
  for (let i = 0; i < 3000; i++) {
    const b = r.beat;
    if (r.sceneId === "the_question" && b.kind === "choice") return r;
    if (b.kind === "investigate") {
      const unseen = b.spots.filter((s) => !s.seen && look.includes(s.id));
      if (unseen.length > 0) r.examine(unseen[0].id);
      else if (b.canLeave) r.leave();
      else r.examine(b.spots.find((s) => !s.seen)!.id);
      continue;
    }
    readOn(r, picks, () => true);
    if (b.kind === "line" || b.kind === "card" || b.kind === "roll")
      r.advance();
    else if (b.kind === "choice") {
      const open = b.options.filter((o) => !o.check?.locked);
      const want = picks[b.id];
      r.choose(
        (
          open.find((o) => o.id === want) ??
          open.find((o) => !o.check) ??
          open[0]
        ).id,
      );
    }
  }
  throw new Error("never reached the question");
}

describe("London's contact, both ways (r25)", () => {
  test("enough noticed: they work out he was watching her, and both must disappear", () => {
    // His look at her table on the way out counts for two.
    const r = toQuestion(["umbrella", "shoes", "ring"], {
      "stranger#1": "stay-where-you-are",
    });
    expect(r.flag("saw_the_look") || r.flag("came_down")).toBeTruthy();
    readOn(r, { "the_question#1": "tell-her" }, (b) => b.kind === "free");
    expect(r.flag("told_telling")).toBeGreaterThanOrEqual(2);
    {
      expect(r.flag("knew_seen")).toBe(1);
      expect(r.flag("missed_watch")).toBe(0);
      expect(r.tasks.find((t) => t.id === "delorme")?.text).toMatch(
        /saw the two of them together/,
      );
    }
  });

  test("nothing (or not enough) noticed: she remarks on him in passing; they part thinking it went all right", () => {
    // Shoes, ring and his drink: nothing telling (and no deduction made).
    const r = toQuestion(["shoes", "ring", "order"], {
      "stranger#1": "move-a-stool-along",
    });
    r.choose("tell-her");
    const seen: string[] = [];
    const hers: string[] = [];
    for (let i = 0; i < 400 && !r.free; i++) {
      const b = r.beat;
      if (b.kind === "line") seen.push(b.text);
      if (b.kind === "line" && b.who === "PENHALLOW") hers.push(b.text);
      if (b.kind === "choice") {
        // Tell her what he has, then that's all.
        const o =
          b.options.find((x) => x.id !== "thats-what-i-have") ?? b.options[0];
        r.choose(o.id);
      } else r.advance();
    }
    const said = seen.join("\n");
    expect(r.flag("told_telling")).toBeLessThan(2);
    {
      expect(r.flag("missed_watch")).toBe(1);
      expect(r.flag("knew_seen")).toBe(0);
      expect(said).toMatch(/every night this week/);
      expect(said).toMatch(/Always the same seat/);
      // Nothing too pointed: not "always facing my mirror".
      expect(hers.join("\n")).not.toMatch(/mirror/i);
      // No thought of vanishing, and no word of having been seen.
      const known = (chapter.facts ?? []).find((f) =>
        f.flags.includes("knew_seen"),
      )!;
      for (const l of seen) expect(factsIn(chapter, l)).not.toContain(known);
      expect(r.tasks.find((t) => t.id === "delorme")?.text).toMatch(
        /always in the same seat/,
      );
    }
  });

  test("the threshold is written down: two telling things, the look counting for two", () => {
    const tell = chapter.scenes.tell_her.ops.find((o) => o.op === "choose");
    if (tell?.op !== "choose") throw new Error("no choice");
    const adds = chapter.scenes.tell_her.ops.filter(
      (o) => o.op === "set" && o.flag === "told_telling",
    );
    expect(adds.length).toBeGreaterThanOrEqual(5);
    expect(
      chapter.scenes.tell_her.ops.some(
        (o) => o.op === "set" && o.flag === "told_telling" && o.value === 2,
      ),
    ).toBe(true);
  });

  test("random paths always set one outcome or the other, never both", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const p = playRandomly(chapter, PLACES, { seed, max: 5000 });
      expect(p.ended).toBe(true);
      const k = p.run.flag("knew_seen");
      const m = p.run.flag("missed_watch");
      expect(k + m, `seed ${seed}`).toBe(1);
    }
  }, 60_000);
});

describe("the lobby (r25)", () => {
  const lobby = PLACES.vauban;

  test("the desk, the keys behind the clerk, the stairs, the lift, seating and light", () => {
    const kinds = lobby.items.filter((i) => i.at[0] > 7).map((i) => i.kind);
    for (const k of [
      "desk",
      "keyboard",
      "stairs",
      "rope",
      "liftdoor",
      "liftbutton",
      "chandelier",
      "floorlamp",
      "ledger",
      "bell",
    ]) {
      expect(kinds, k).toContain(k);
    }
    expect(
      lobby.items.filter((i) => i.at[0] > 7 && i.model === "loungeChair")
        .length,
    ).toBe(2);
    // The clerk stands behind his desk, the key board behind him.
    const clerk = lobby.marks.porter_spot.at;
    const desk = lobby.items.find((i) => i.kind === "desk")!;
    const board = lobby.items.find((i) => i.kind === "keyboard")!;
    expect(clerk[0]).toBeLessThan(desk.at[0]);
    expect(board.at[0]).toBeLessThan(clerk[0]);
    // The doorways to the bar and the street.
    expect(lobby.hotspots.hotel_street_door.to?.place).toBe("street");
    expect(lobby.hotspots.stairs.to).toEqual({
      place: "room",
      mark: "room_in",
    });
  });

  test("the guest book is never read: the clerk keeps it to himself", () => {
    // No scene shows what's in it: no room, no name, no date.
    const g = text("guest_book");
    expect(g).toMatch(/turned to face the clerk/);
    expect(g).not.toMatch(/\d|Delorme|forty|M\. /);
    expect(chapter.scenes.register).toBeUndefined();
    // Asking to see it is turned down.
    const ask = chapter.scenes.clerk_ask.ops.find((o) => o.op === "choose");
    if (ask?.op !== "choose") throw new Error("no choice");
    expect(ask.options.map((o) => o.id)).toContain("ask-to-see-the-guest-book");
    expect(text("clerk_ask")).toMatch(/closed the guest book on his finger/);
    // And nothing anywhere turns it round for him.
    for (const id of chapter.order) {
      expect(text(id), id).not.toMatch(
        /turned the (register|guest book) round/,
      );
    }
  });

  test("the lift can't be used, all night", () => {
    expect(lobby.hotspots.lift.to).toBeUndefined();
    const looks = chapter.order.filter(
      (id) => chapter.scenes[id].trigger?.target === "lift",
    );
    expect(looks.length).toBeGreaterThan(0);
    for (const id of looks) {
      expect(chapter.scenes[id].trigger?.cond).toBeUndefined();
      expect(chapter.scenes[id].ops.some((o) => o.op === "place")).toBe(false);
    }
    // Its sign says so, the whole time.
    expect(
      lobby.items.some((i) => i.kind === "sign" && i.text === "HORS SERVICE"),
    ).toBe(true);
  });

  test("the reason the stairs are shut is the same everywhere", () => {
    // The card on the rope, the clerk, his thought: guests take their key at
    // the desk (the Préfecture's circular), and his room isn't made up yet.
    const card = lobby.items.find((i) => i.id === "stair_rope")!;
    expect(String(card.sub)).toMatch(/adresser à la réception/);
    expect(text("clerk_first")).toMatch(/not made up/);
    expect(text("clerk_first")).toMatch(/Préfecture's circular/);
    expect(text("stairs_closed")).toMatch(/isn't made up yet/);
    expect(text("clerk_ready")).toMatch(/the stairs are fine to take/);
  });
});

describe("the regulars (r25)", () => {
  const patrons = ["REGULAR", "WORKER", "COUPLE_M", "COUPLE_F", "READER"];

  test("in Le Vauban from the start, each with a life and a line or two", () => {
    const r = street();
    for (const who of patrons) {
      const st = r.stage.actors[who];
      expect(st?.place, who).toBe("vauban");
      expect(PLACES.vauban.marks[st!.at], who).toBeDefined();
      expect(st?.idle, who).toMatch(/^(drink|read|talk:\w+)$/);
    }
    // Two at the bar, a couple at a table, a man reading.
    expect(r.stage.actors.REGULAR?.at).toMatch(/^stool_/);
    expect(r.stage.actors.WORKER?.at).toMatch(/^stool_/);
    expect(r.stage.actors.COUPLE_M?.idle).toBe(r.stage.actors.COUPLE_F?.idle);
    expect(r.stage.actors.READER?.idle).toBe("read");
  });

  test("reachable and harmless: they answer, and change nothing", () => {
    const r = street();
    r.enterPlace("vauban", "vauban_door_in");
    readOn(r);
    for (const who of patrons) {
      const before = JSON.stringify({
        f: r.values().flags,
        k: r.kit,
        t: r.tasks,
      });
      expect(
        r.available(Object.keys(PLACES.vauban.hotspots)).talk,
        who,
      ).toContain(who);
      expect(r.talk(who), who).not.toBeNull();
      readOn(r);
      expect(r.free, who).toBe(true);
      expect(
        JSON.stringify({ f: r.values().flags, k: r.kit, t: r.tasks }),
        who,
      ).toBe(before);
    }
    // Their scenes set nothing the story reads, give nothing, take nothing.
    for (const id of ["regular", "worker", "couple", "couple_her", "reader"]) {
      for (const o of chapter.scenes[id].ops) {
        expect(
          ["set", "rel", "item", "money", "equip", "task"],
          id,
        ).not.toContain(o.op);
      }
    }
  });
});

describe("the sound (r25)", () => {
  const AUDIO = path.join(ROOT, "src/based/audio");
  const files = fs.readdirSync(AUDIO).filter((f) => f.endsWith(".mp3"));
  const keys = new Set(files.map((f) => f.slice(0, -4)));

  test("every sound the game asks for is there", () => {
    // The places' beds, spots, the TV and what comes now and then.
    for (const p of Object.values(PLACES)) {
      const s = p.sound;
      expect(s, p.key).toBeDefined();
      const named = [
        ...(s!.beds ?? []),
        ...Object.values(s!.areas ?? {}).flatMap((a) => [
          ...(a.beds ?? []),
          ...(a.random ?? []),
        ]),
        ...(s!.spots ?? []),
        ...(s!.random ?? []),
        ...(s!.tv ? [s!.tv] : []),
      ].map((b) => b.key);
      for (const k of named) {
        expect(keys.has(k) || k in EFFECTS, `${p.key}: ${k}`).toBe(true);
      }
    }
    // The client's loops, sprites and the score's cues.
    for (const k of [
      "rain",
      "rain_in",
      "siren",
      ...Object.keys(LOOPS),
      ...Object.keys(SPRITES),
      ...Object.values(CUES),
    ]) {
      expect(keys.has(k), k).toBe(true);
    }
    // Every effect's slot is in its sprite.
    for (const [name, e] of Object.entries(EFFECTS)) {
      for (const n of e.names)
        expect(SPRITES[e.sprite]?.names, name).toContain(n);
    }
    for (const s of ["stone", "wet", "tile", "wood", "carpet"]) {
      expect(keys.has(`steps_${s}`), s).toBe(true);
    }
    // Every @sound a scene can ask for, the client can play.
    for (const cue of SOUND_CUES) {
      expect(cue === "siren" || cue in EFFECTS, cue).toBe(true);
    }
    // The bar's door has its bell; the stairs, their steps.
    expect(PLACES.vauban.hotspots.street_door.sound).toBe("bar_bell");
    expect(PLACES.street.hotspots.vauban_door.sound).toBe("bar_bell");
    expect(PLACES.vauban.hotspots.stairs.sound).toBe("stairs");
  });

  test("compact: small files, a few megabytes in all", () => {
    let total = 0;
    for (const f of files) {
      const n = fs.statSync(path.join(AUDIO, f)).size;
      total += n;
      expect(n, f).toBeLessThanOrEqual(400_000);
      // MP3 (an ID3 tag or a frame sync).
      const head = fs.readFileSync(path.join(AUDIO, f)).subarray(0, 3);
      expect(
        head.toString() === "ID3" ||
          (head[0] === 0xff && (head[1] & 0xe0) === 0xe0),
        f,
      ).toBe(true);
    }
    expect(total).toBeLessThan(3_500_000);
  });

  test("credited: every file, the score's under CC0", () => {
    const credits = JSON.parse(
      fs.readFileSync(path.join(ROOT, "src/based/art/credits.json"), "utf8"),
    ) as { items: { keys: string[]; what: string; license: string }[] };
    for (const k of keys) {
      const c = credits.items.filter((i) => i.keys.includes(k));
      expect(c.length, k).toBeGreaterThan(0);
      for (const i of c) {
        expect(["Sound", "Music"], k).toContain(i.what);
        expect(i.license, k).toMatch(
          /^(CC0|CC BY|Public domain|Original work)/,
        );
      }
    }
    expect(
      credits.items
        .filter((i) => i.what === "Music")
        .every((i) => i.license.startsWith("CC0")),
    ).toBe(true);
  });

  test("the story's sounds are cues the validator knows", () => {
    const { errors } = parseChapter(
      `@chapter 1 "T"\n@cast HERO "Hero"\n== a\n@sound nope\n-> END\n`,
    );
    expect(errors.map((e) => e.message).join()).toMatch(/@sound/);
    const used = chapter.order.flatMap((id) =>
      chapter.scenes[id].ops.flatMap((o) => (o.op === "sound" ? [o.key] : [])),
    );
    expect(used).toEqual(
      expect.arrayContaining([
        "bar_bell",
        "desk_bell",
        "lift_button",
        "rope",
        "key",
        "tv_off",
      ]),
    );
  });
});

describe("saves made before this round (r25)", () => {
  /** A slot from rounds 22 to 24: free after the contact, the river ahead. */
  function oldFree(): Snapshot {
    const r = street(5);
    r.enterPlace("vauban", "vauban_door_in");
    readOn(r);
    r.talk("BARMAN");
    readOn(r, { "the_question#1": "tell-her" });
    const s = r.snapshot();
    for (const f of ["knew_seen", "missed_watch", "crowd"]) delete s.flags[f];
    for (const w of ["REGULAR", "WORKER", "COUPLE_M", "COUPLE_F", "READER"]) {
      delete s.stage.actors[w];
    }
    delete s.tasks!.sleep;
    s.tasks!.night = {
      text: "When he's seen enough, call it a night. The river is west, at the end of the rue de Grenelle.",
      done: false,
    };
    return s;
  }

  test("free after the contact: the new end takes over, the regulars come back", () => {
    const r = new StoryRun(chapter, oldFree());
    expect(r.beat).toEqual({ kind: "free" });
    // Once anything settles him: on through a door.
    r.enterPlace("vauban", "lobby_in");
    readOn(r);
    expect(r.flag("knew_seen") + r.flag("missed_watch")).toBe(1);
    expect(r.tasks.find((t) => t.id === "night")?.text).toMatch(/go up to bed/);
    r.enterPlace("vauban", "vauban_door_in");
    readOn(r);
    expect(r.flag("crowd")).toBe(1);
    expect(r.stage.actors.REGULAR?.at).toBe("stool_4");
    // And it plays to the end, up the stairs.
    const p = playRandomly(chapter, PLACES, {
      seed: 3,
      from: r.snapshot(),
      max: 5000,
    });
    expect(p.ended).toBe(true);
    expect(p.run.history()).toContain("s:room");
    expect(p.run.tasks.find((t) => t.id === "night")?.done).toBe(true);
  });

  test("a save with matches but from before the light was a flag: he can still offer it", () => {
    const r0 = street(11);
    getMatches(r0);
    const s = r0.snapshot();
    delete s.flags.has_light;
    const r = new StoryRun(chapter, s);
    expect(r.flag("has_light")).toBe(0);
    // Anything that settles him (a door) brings it in line.
    r.enterPlace("vauban", "vauban_door_in");
    readOn(r);
    expect(r.flag("has_light")).toBe(1);
    r.enterPlace("street", "vauban_door_out");
    readOn(r);
    r.talk("WATCHER");
    readOn(r);
    expect(r.flag("met_watcher")).toBe(1);
  });

  test("r26: a save with the baton, the lighter, the key to twelve and English (British)", () => {
    const s = oldFree();
    s.inv = {
      ...s.inv,
      baton: 1,
      brass_lighter: 1,
      room_key: 1,
      phrasebook: 1,
    };
    s.worn = {
      ...s.worn,
      hand: "baton",
      glasses: "reading_glasses",
      hat: "flat_cap",
    };
    s.flags = { ...s.flags, took_baton: 1, took_lost: 1, knows_jean: 1 };
    s.build = { ...s.build!, langPts: { fr: 2, en_gb: 2 } };
    for (const gone of ["lost_take", "van_door", "use_baton", FREE]) {
      const r = new StoryRun(
        chapter,
        JSON.parse(JSON.stringify({ ...s, scene: gone })),
      );
      // Free where he was; what's gone, gone quietly.
      expect(r.beat, gone).toEqual({ kind: "free" });
      for (const k of ["baton", "brass_lighter", "room_key", "phrasebook"]) {
        expect(r.has(k), `${gone}: ${k}`).toBe(false);
        expect(r.items[k], `${gone}: ${k}`).toBeUndefined();
      }
      expect(Object.values(r.gear)).not.toContain("baton");
      expect(Object.values(r.gear)).not.toContain("reading_glasses");
      expect(r.armed).toBe(false);
      // His English (British) went to his Russian.
      expect(r.languages()).toEqual({ fr: 2, ru: 2 });
      // And it plays on to the end.
      const p = playRandomly(chapter, PLACES, {
        seed: 9,
        from: r.snapshot(),
        max: 5000,
      });
      expect(p.ended, gone).toBe(true);
    }
  });

  test("a save in a scene that's gone (the walk to the river) loads free there", () => {
    for (const gone of [
      "street",
      "street_end",
      "too_early",
      "idea_watching",
      "watcher_after",
      "register",
      "porter",
    ]) {
      const s = oldFree();
      const r = new StoryRun(chapter, { ...s, scene: gone });
      expect(r.free, gone).toBe(true);
      const p = playRandomly(chapter, PLACES, {
        seed: 9,
        from: r.snapshot(),
        max: 5000,
      });
      expect(p.ended, gone).toBe(true);
    }
  });

  test("a save from before the contact still plays: the stairs wait for the room", () => {
    const r = street(2);
    const s = r.snapshot();
    delete s.flags.crowd;
    const back = new StoryRun(chapter, { ...s, scene: FREE });
    back.enterPlace("vauban", "lobby_in");
    readOn(back);
    expect(back.look("stairs")).not.toBeNull();
    expect(back.sceneId).toBe("stairs_closed");
    readOn(back);
    const p = playRandomly(chapter, PLACES, {
      seed: 4,
      from: back.snapshot(),
      max: 5000,
    });
    expect(p.ended).toBe(true);
  });
});
