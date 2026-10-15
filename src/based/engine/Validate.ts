// Checks a compiled chapter the way an editor would before a read-through:
// every jump lands, no scene runs off its end, every flag that's read is set
// somewhere, every scene can be reached, and the chapter can be finished.
// r21: every skill named is a @skill, check options and checked deductions
// are sound, and every mark, hotspot, shot and prop a scene names is in the
// place it's in.
// r22: the open world. Scenes started by `@on` are reached from `-> FREE`;
// what they name (people, hotspots, places) must exist; from anywhere the
// player can get to, the chapter must still be able to end; and the places'
// doors must lead somewhere real.
// r22 BPLAY: what he carries. Every item named (give, take, equip, has.,
// wears., needs=, @on use) is an @item; every equip is something worn or
// held; every bonus names a skill; and an item a scene needs (an option's
// needs=, a condition on has. or wears., a use) can be got before it: from
// his starting kit, earlier in that scene, or in a scene the player can
// reach without going through the one that needs it.
// Run by the tests and by the server when it loads a chapter. Linear in the
// size of the chapter, so a long story stays quick to check.

import { exprReads } from "./Expr";
import { PlaceDef, placeNames } from "./Place";
import { Chapter, END, Expr, FREE, Op, Scene } from "./Types";

/**
 * The items a condition needs him to have (not those it hopes he hasn't).
 * Treated as "any of them": `has.matchbook or has.brass_lighter` needs one.
 */
function wantedItems(e: Expr | undefined, neg = false, out: string[] = []) {
  if (!e) return out;
  switch (e.k) {
    case "has":
    case "wears":
      if (!neg) out.push(e.item);
      break;
    case "not":
      wantedItems(e.e, !neg, out);
      break;
    case "and":
    case "or":
    case "cmp":
      wantedItems(e.a, neg, out);
      wantedItems(e.b, neg, out);
      break;
    default:
      break;
  }
  return out;
}

export interface Problem {
  scene?: string;
  line: number;
  message: string;
  /** Warnings don't fail the tests; errors do. */
  level: "error" | "warning";
}

export interface ValidateOptions {
  /** Art keys that exist (backdrops and portraits). */
  art?: Set<string>;
  /** Sound keys that exist. */
  sounds?: Set<string>;
  /** r21: the 3D places that exist, by key. */
  places?: Record<string, PlaceDef>;
}

/** Ops reachable from `from` inside one scene, stopping at gotos/returns. */
function walk(
  scene: Scene,
  from: number,
  visit: (op: Op, at: number) => void,
): void {
  const seen = new Set<number>();
  const todo = [from];
  while (todo.length > 0) {
    const at = todo.pop()!;
    if (seen.has(at) || at < 0 || at >= scene.ops.length) continue;
    seen.add(at);
    const op = scene.ops[at];
    visit(op, at);
    switch (op.op) {
      case "if":
        todo.push(at + 1, op.else);
        break;
      case "jump":
        todo.push(op.to);
        break;
      case "goto":
      case "return":
      case "fall":
        break;
      case "choose":
        for (const o of op.options) todo.push(o.at);
        break;
      case "investigate":
        todo.push(op.after);
        break;
      case "check":
        todo.push(at + 1, op.fail);
        break;
      default:
        todo.push(at + 1);
    }
  }
}

type Add = (
  level: Problem["level"],
  scene: string | undefined,
  line: number,
  message: string,
) => void;

export function validateChapter(
  chapter: Chapter,
  opts: ValidateOptions = {},
): Problem[] {
  const out: Problem[] = [];
  const add: Add = (level, scene, line, message) =>
    out.push({ level, scene, line, message });

  const cast = new Set(chapter.cast.map((c) => c.id));
  const flagsSet = new Set<string>();
  /** Flags set with set/add (spots and deductions set their own). */
  const written = new Set<string>();
  const reads: { flag: string; scene: string; line: number }[] = [];
  const skills = new Set(chapter.skills.map((x) => x.id));
  const langs = new Set(chapter.languages.map((l) => l.code));
  const items = chapter.items ?? {};
  const item = (k: string, scene: string | undefined, line: number) => {
    if (!items[k]) add("error", scene, line, `item "${k}" isn't an @item`);
  };
  /** r22 BPLAY: scenes that need an item (any of `items`), and where. */
  const needs: { scene: string; at: number; items: string[]; line: number }[] =
    [];
  const readExpr = (e: Expr | undefined, scene: string, line: number) => {
    if (!e) return;
    const r = exprReads(e, {
      flags: [],
      rels: [],
      skills: [],
      langs: [],
      items: [],
    });
    for (const k of new Set(r.items)) item(k, scene || undefined, line);
    for (const f of r.flags) reads.push({ flag: f, scene, line });
    for (const w of r.rels) {
      if (!cast.has(w)) add("error", scene, line, `rel.${w}: not in the cast`);
    }
    for (const k of r.skills ?? []) {
      if (!skills.has(k)) {
        add("error", scene, line, `skill.${k.toLowerCase()}: not a @skill`);
      }
    }
    for (const c of r.langs ?? []) {
      if (!langs.has(c)) {
        add("error", scene, line, `speaks.${c}: not a @language`);
      }
    }
  };

  // r21: skills, attributes and builds.
  for (const a of chapter.attributes) {
    if (!chapter.skills.some((x) => x.attr === a.id)) {
      add("warning", undefined, 1, `@attribute ${a.id} has no skills`);
    }
  }
  const usesSkills = chapter.order.some((id) =>
    chapter.scenes[id].ops.some(
      (op) =>
        op.op === "check" ||
        op.op === "boost" ||
        (op.op === "line" && op.skill !== undefined) ||
        (op.op === "investigate" && op.deductions.some((d) => d.check)),
    ),
  );
  if (usesSkills && chapter.archetypes.length === 0) {
    add(
      "warning",
      undefined,
      1,
      "the chapter has checks but no @archetype for the setup screen",
    );
  }

  for (const c of chapter.cast) {
    if (c.portrait && opts.art && !opts.art.has(c.portrait)) {
      add(
        "error",
        undefined,
        1,
        `${c.id}'s portrait "${c.portrait}" isn't in the art folder`,
      );
    }
  }

  // r22 BPLAY: the items themselves.
  const wornAtStart = new Map<string, string>();
  for (const it of Object.values(items)) {
    for (const b of it.bonus) {
      if (!skills.has(b.skill)) {
        add(
          "error",
          undefined,
          it.src,
          `@item ${it.key}: bonus ${b.skill} isn't a @skill`,
        );
      }
    }
    if (it.start === "worn" && it.slot) {
      const other = wornAtStart.get(it.slot);
      if (other) {
        add(
          "error",
          undefined,
          it.src,
          `@item ${it.key}: ${other} is already worn at the start (${it.slot})`,
        );
      } else wornAtStart.set(it.slot, it.key);
    }
  }

  // r22: what starts each scene must exist.
  const places = opts.places;
  for (const id of chapter.order) {
    const scene = chapter.scenes[id];
    const t = scene.trigger;
    if (!t) continue;
    readExpr(t.cond, id, scene.src);
    if (t.place !== undefined && places && !places[t.place]) {
      add("error", id, scene.src, `@on ... in=${t.place}: no such place`);
    }
    const wanted = wantedItems(t.cond);
    if (wanted.length > 0) {
      needs.push({ scene: id, at: 0, items: wanted, line: scene.src });
    }
    if (t.on === "use") {
      item(t.target!, id, scene.src);
      needs.push({ scene: id, at: 0, items: [t.target!], line: scene.src });
    }
    if (t.on === "talk" && !cast.has(t.target!)) {
      add("error", id, scene.src, `@on talk ${t.target}: not in the cast`);
    } else if (t.on === "enter" && places && !places[t.target!]) {
      add("error", id, scene.src, `@on enter ${t.target}: no such place`);
    } else if (t.on === "look" && places) {
      const where = t.place !== undefined ? [t.place] : Object.keys(places);
      if (!where.some((p) => places[p]?.hotspots[t.target!])) {
        add(
          "error",
          id,
          scene.src,
          `@on look ${t.target}: no hotspot "${t.target}" in ${
            t.place !== undefined ? `the place "${t.place}"` : "any place"
          }`,
        );
      }
    }
  }

  const edges = new Map<string, Set<string>>();
  const endsIn = new Set<string>();
  const freeFrom = new Set<string>();
  /** r22 BPLAY: where each item is given (or put on him), by scene and op. */
  const givers = new Map<string, { scene: string; at: number }[]>();

  for (const id of chapter.order) {
    const scene = chapter.scenes[id];
    const targets = new Set<string>();
    edges.set(id, targets);

    // Every op, for flags set and things referenced.
    scene.ops.forEach((op, at) => {
      switch (op.op) {
        case "item":
          item(op.key, id, op.src);
          if (op.delta > 0)
            givers.set(op.key, [
              ...(givers.get(op.key) ?? []),
              { scene: id, at },
            ]);
          break;
        case "equip": {
          item(op.key, id, op.src);
          const it = items[op.key];
          if (it && !it.slot) {
            add(
              "error",
              id,
              op.src,
              `equip ${op.key}: it isn't worn or held (give it a slot=)`,
            );
          }
          givers.set(op.key, [
            ...(givers.get(op.key) ?? []),
            { scene: id, at },
          ]);
          break;
        }
        case "set":
          flagsSet.add(op.flag);
          written.add(op.flag);
          break;
        case "if":
          readExpr(op.cond, id, op.src);
          break;
        case "line":
          if (op.lang !== undefined && !langs.has(op.lang)) {
            add(
              "warning",
              id,
              op.src,
              `[${op.lang}] isn't a @language: nobody can be given it`,
            );
          }
          break;
        case "backdrop":
          if (op.key && opts.art && !opts.art.has(op.key)) {
            add(
              "error",
              id,
              op.src,
              `@backdrop ${op.key}: no such picture in the art folder`,
            );
          }
          break;
        case "vignette":
          if (op.key && opts.art && !opts.art.has(op.key)) {
            add(
              "error",
              id,
              op.src,
              `@vignette ${op.key}: no such picture in the art folder`,
            );
          }
          break;
        case "ambient":
          if (op.key && opts.sounds && !opts.sounds.has(op.key)) {
            add("error", id, op.src, `@ambient ${op.key}: no such sound`);
          }
          break;
        case "figure":
          if (op.who) {
            const who = chapter.cast.find((c) => c.id === op.who);
            if (who && !who.portrait) {
              add(
                "error",
                id,
                op.src,
                `@figure ${op.who}: they have no portrait=`,
              );
            }
          }
          break;
        case "choose": {
          for (const o of op.options) {
            readExpr(o.cond, id, op.src);
            for (const m of o.check?.mods ?? []) readExpr(m.cond, id, op.src);
            for (const k of o.needs ?? []) item(k, id, op.src);
            if (o.needs) {
              needs.push({ scene: id, at, items: o.needs, line: op.src });
            }
            const wanted = wantedItems(o.cond);
            if (wanted.length > 0) {
              needs.push({ scene: id, at, items: wanted, line: op.src });
            }
          }
          const always = op.options.filter(
            (o) => !o.cond && !o.once && !o.check && !o.needs,
          );
          if (always.length === 0) {
            add(
              "error",
              id,
              op.src,
              `choice "${op.prompt || op.id}" could run out of options: give it one with no "if", "once", "needs=" or check`,
            );
          }
          if (
            op.timer > 0 &&
            !op.options.some(
              (o) => o.silent && !o.cond && !o.once && !o.check && !o.needs,
            )
          ) {
            add(
              "warning",
              id,
              op.src,
              `timed choice "${op.prompt || op.id}" has no silent option; the clock picks the first`,
            );
          }
          break;
        }
        case "investigate": {
          const ids = new Set<string>();
          for (const s of op.spots) {
            flagsSet.add(s.id);
            ids.add(s.id);
          }
          for (const d of op.deductions) {
            flagsSet.add(d.id);
            ids.add(d.id);
          }
          for (const d of op.deductions) {
            for (const m of d.check?.mods ?? []) readExpr(m.cond, id, op.src);
            for (const need of d.needs) {
              reads.push({ flag: need, scene: id, line: op.src });
              if (!ids.has(need)) {
                add(
                  "error",
                  id,
                  op.src,
                  `deduce ${d.id} needs "${need}", which isn't a spot or deduction here`,
                );
              }
            }
            if (d.needs.length === 0) {
              add(
                "warning",
                id,
                op.src,
                `deduce ${d.id} needs nothing; it's ready at once`,
              );
            }
          }
          if (op.min > op.spots.length) {
            add(
              "error",
              id,
              op.src,
              `min=${op.min}, but there are only ${op.spots.length} spots`,
            );
          }
          // Spot and deduction texts (and failures) must come back to the
          // room.
          const bodies = [
            ...op.spots,
            ...op.deductions,
            ...op.deductions
              .filter((d) => d.failAt !== undefined)
              .map((d) => ({ id: `${d.id} (fail)`, at: d.failAt! })),
          ];
          for (const body of bodies) {
            walk(scene, body.at, (inner) => {
              if (inner.op === "goto") {
                add(
                  "error",
                  id,
                  inner.src,
                  `"-> ${inner.scene}" inside ${body.id}: a spot's text can't leave the room`,
                );
              } else if (inner.op === "investigate") {
                add(
                  "error",
                  id,
                  inner.src,
                  `an investigation inside ${body.id}`,
                );
              } else if (inner.op === "fall") {
                add(
                  "error",
                  id,
                  inner.src,
                  `${body.id}'s text never comes back`,
                );
              }
            });
          }
          break;
        }
        default:
          break;
      }
    });

    // What the scene's own flow reaches.
    walk(scene, 0, (op) => {
      if (op.op === "check" && op.fail < 0) {
        add("error", id, op.src, `check "${op.label}" has nowhere to fail to`);
      }
      if (op.op === "goto") {
        if (op.scene === END) endsIn.add(id);
        else if (op.scene === FREE) freeFrom.add(id);
        else if (!chapter.scenes[op.scene]) {
          add("error", id, op.src, `"-> ${op.scene}": there's no such scene`);
        } else targets.add(op.scene);
      } else if (op.op === "fall") {
        add(
          "error",
          id,
          scene.src,
          `scene "${id}" can run off its end: finish every path with "-> scene", "-> FREE" or "-> END"`,
        );
      } else if (op.op === "return") {
        add(
          "error",
          id,
          op.src,
          `the story walks into a spot's text without examining it`,
        );
      }
    });
  }

  for (const c of chapter.carry) readExpr(c.cond, "", 1);

  checkPlaces(chapter, opts, add);

  for (const r of reads) {
    if (!flagsSet.has(r.flag)) {
      add(
        "error",
        r.scene || undefined,
        r.line,
        `flag "${r.flag}" is read but never set`,
      );
    }
  }
  const readSet = new Set(reads.map((r) => r.flag));
  for (const f of written) {
    if (!readSet.has(f)) {
      add(
        "warning",
        undefined,
        1,
        `flag "${f}" is set but never read (fine if a later chapter reads it)`,
      );
    }
  }

  // The graph: scenes, and FREE, from which any scene with an @on can start.
  const triggered = chapter.order.filter((id) => chapter.scenes[id].trigger);
  const next = (id: string): Iterable<string> => {
    if (id === FREE) return triggered;
    const e = [...(edges.get(id) ?? [])];
    if (freeFrom.has(id)) e.push(FREE);
    return e;
  };

  // Reachability from the start.
  const reached = new Set<string>();
  const todo = chapter.start ? [chapter.start] : [];
  while (todo.length > 0) {
    const id = todo.pop()!;
    if (reached.has(id) || (id !== FREE && !chapter.scenes[id])) continue;
    reached.add(id);
    for (const t of next(id)) todo.push(t);
  }
  const freeReached = reached.has(FREE);
  for (const id of chapter.order) {
    if (!reached.has(id)) {
      const t = chapter.scenes[id].trigger;
      add(
        "error",
        id,
        chapter.scenes[id].src,
        t && !freeReached
          ? `scene "${id}" starts with @on, but nothing ever reaches "-> FREE"`
          : `scene "${id}" can't be reached from "${chapter.start}"`,
      );
    }
  }
  if (endsIn.size === 0) {
    add("error", undefined, 1, `nothing ever reaches "-> END"`);
  }

  // A scene from which END can't be reached is a trap: walk back from END.
  const back = new Map<string, string[]>();
  for (const id of [...chapter.order, FREE]) {
    for (const t of next(id)) {
      const list = back.get(t) ?? [];
      list.push(id);
      back.set(t, list);
    }
  }
  const reachesEnd = new Set<string>(endsIn);
  const queue = [...endsIn];
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const p of back.get(id) ?? []) {
      if (!reachesEnd.has(p)) {
        reachesEnd.add(p);
        queue.push(p);
      }
    }
  }
  for (const id of reached) {
    if (!reachesEnd.has(id)) {
      add(
        "error",
        id === FREE ? undefined : id,
        id === FREE ? 1 : chapter.scenes[id].src,
        id === FREE
          ? `once he's free, nothing he can start ever leads to "-> END"`
          : `from "${id}" the chapter can never end`,
      );
    }
  }

  // r22 BPLAY: an item a scene needs can be got before it.
  checkNeeds(chapter, needs, givers, next, add);

  // r22: someone on stage in the open world with nothing to say.
  if (freeReached) {
    const talkers = new Set<string>();
    for (const id of triggered) {
      const t = chapter.scenes[id].trigger!;
      if (t.on === "talk") talkers.add(t.target!);
    }
    const bodyOf = (c: string) =>
      chapter.cast.find((x) => x.id === c)?.body ?? c;
    const speaks = new Set([...talkers].map(bodyOf));
    const hero = chapter.cast[0]?.id;
    // Only in places the open world reaches (a look or an arrival there).
    const open = new Set<string>();
    for (const id of triggered) {
      const t = chapter.scenes[id].trigger!;
      if (t.place) open.add(t.place);
      else if (t.on === "enter") open.add(t.target!);
      else if (t.on === "look") {
        for (const [k, p] of Object.entries(opts.places ?? {})) {
          if (p.hotspots[t.target!]) open.add(k);
        }
      }
    }
    const placed = new Set<string>();
    for (const id of chapter.order) {
      let now: string | null = null;
      for (const op of chapter.scenes[id].ops) {
        if (op.op === "place") now = op.key;
        if (op.op === "actor" && op.state && op.who !== hero) {
          const where = op.state.place ?? now;
          if (where === null || open.has(where) || !opts.places) {
            placed.add(op.who);
          }
        }
      }
    }
    for (const who of placed) {
      if (!speaks.has(who) && !talkers.has(who)) {
        add(
          "warning",
          undefined,
          1,
          `${who} can be found in the world but has no "@on talk ${who}" scene`,
        );
      }
    }
  }

  return out;
}

/**
 * r22 BPLAY: for each scene that needs an item, one of the items can be got
 * first: he starts with it, an earlier op in that scene gives it, or a
 * scene that gives it can be reached from the start without passing
 * through this one. One walk of the graph per scene that needs something.
 */
function checkNeeds(
  chapter: Chapter,
  needs: { scene: string; at: number; items: string[]; line: number }[],
  givers: Map<string, { scene: string; at: number }[]>,
  next: (id: string) => Iterable<string>,
  add: Add,
): void {
  const kit = new Set(
    Object.values(chapter.items ?? {})
      .filter((it) => it.start !== undefined)
      .map((it) => it.key),
  );
  const byScene = new Map<string, typeof needs>();
  for (const n of needs) {
    if (n.items.some((k) => kit.has(k))) continue;
    const list = byScene.get(n.scene) ?? [];
    list.push(n);
    byScene.set(n.scene, list);
  }
  for (const [scene, list] of byScene) {
    // Everything reachable from the start without going through `scene`.
    const seen = new Set<string>();
    const todo =
      chapter.start && chapter.start !== scene ? [chapter.start] : [];
    while (todo.length > 0) {
      const id = todo.pop()!;
      if (seen.has(id) || id === scene) continue;
      if (id !== FREE && !chapter.scenes[id]) continue;
      seen.add(id);
      for (const t of next(id)) todo.push(t);
    }
    for (const n of list) {
      const ok = n.items.some((k) =>
        (givers.get(k) ?? []).some(
          (g) => seen.has(g.scene) || (g.scene === scene && g.at < n.at),
        ),
      );
      if (!ok) {
        add(
          "error",
          scene,
          n.line,
          `"${scene}" needs ${n.items.map((k) => `"${k}"`).join(" or ")}, but nothing gives ${
            n.items.length > 1 ? "any of them" : "it"
          } before`,
        );
      }
    }
  }
}

/**
 * What each scene can name in its place. Places carry from scene to scene,
 * so this follows the jumps: a scene may be entered in more than one place,
 * and every name it uses must exist in each. r22: a scene started by `@on`
 * is entered where its trigger fires (the place with its hotspot, the place
 * walked into, where its person is put); a thought, or one that starts by
 * itself, may come anywhere, so its names need only exist somewhere.
 */
function checkPlaces(chapter: Chapter, opts: ValidateOptions, add: Add): void {
  const places = opts.places;
  const ANY = "*";
  const namesOf = new Map<string, ReturnType<typeof placeNames>>();
  const names = (key: string) => {
    let n = namesOf.get(key);
    if (!n && places?.[key]) {
      n = placeNames(places[key]);
      namesOf.set(key, n);
    }
    return n ?? null;
  };
  // Where each cast member is ever put, for scenes that start by talking.
  const putIn = new Map<string, Set<string>>();
  // Where the hotspot of each look is.
  const hotspotIn = (h: string) =>
    Object.keys(places ?? {}).filter((k) => places![k].hotspots[h]);

  const entry = new Map<string, Set<string | null>>();
  const todo: [string, string | null][] = chapter.start
    ? [[chapter.start, null]]
    : [];
  const pass = (collect: boolean) => {
    const checked = new Set<string>();
    while (todo.length > 0) {
      const [id, at] = todo.pop()!;
      const scene = chapter.scenes[id];
      if (!scene) continue;
      const seen = entry.get(id) ?? new Set();
      if (seen.has(at)) continue;
      seen.add(at);
      entry.set(id, seen);
      // Walk the scene in order; a place op changes what's in effect after it.
      let now: string | null = at;
      for (const op of scene.ops) {
        const where = `${op.src}:${now}`;
        const once = !checked.has(`${id}@${where}`);
        checked.add(`${id}@${where}`);
        const need = (
          what: "marks" | "hotspots" | "shots" | "props",
          key: string,
          label: string,
          in_: string | null = now,
        ) => {
          if (!once || collect || in_ === null || !places) return;
          if (in_ === ANY) {
            if (!Object.keys(places).some((p) => names(p)?.[what].has(key))) {
              add("error", id, op.src, `${label} "${key}" isn't in any place`);
            }
            return;
          }
          const n = names(in_);
          if (n && !n[what].has(key)) {
            add(
              "error",
              id,
              op.src,
              `${label} "${key}" isn't in the place "${in_}"`,
            );
          }
        };
        switch (op.op) {
          case "place":
            if (op.key !== null && places && !places[op.key] && !collect) {
              add("error", id, op.src, `@place ${op.key}: no such place`);
            }
            now = op.key;
            break;
          case "actor":
            if (op.state) {
              const in_ = op.state.place ?? now;
              if (op.state.place !== undefined && places && !places[in_!]) {
                if (!collect) {
                  add(
                    "error",
                    id,
                    op.src,
                    `@actor ... in=${in_}: no such place`,
                  );
                }
              } else if (in_ === null && once && !collect) {
                add(
                  "error",
                  id,
                  op.src,
                  `@actor ${op.who} needs a @place first`,
                );
              }
              if (collect && in_ !== null && in_ !== ANY) {
                const s = putIn.get(op.who) ?? new Set();
                s.add(in_);
                putIn.set(op.who, s);
              }
              need("marks", op.state.at, "mark", in_);
            }
            break;
          case "focus":
            if (op.key) need("shots", op.key, "shot");
            break;
          case "prop":
            need("props", op.key, "prop");
            break;
          case "investigate":
            for (const s of op.spots) {
              if (s.anchor !== undefined) {
                if (now === null && once && !collect) {
                  add(
                    "error",
                    id,
                    op.src,
                    `spot ${s.id} is on a hotspot, but there's no @place`,
                  );
                }
                need("hotspots", s.anchor, "hotspot");
              }
            }
            if (op.exit) need("hotspots", op.exit, "exit");
            break;
          case "goto":
            if (op.scene !== END && op.scene !== FREE) {
              todo.push([op.scene, now]);
            }
            break;
          default:
            break;
        }
      }
    }
  };
  // First, from the start and from every scene the open world starts where
  // that's plain, to learn where people are put; then every scene the open
  // world can start, from where it starts.
  const seeds = (talk: boolean) => {
    if (chapter.start) todo.push([chapter.start, null]);
    for (const id of chapter.order) {
      const t = chapter.scenes[id].trigger;
      if (!t || (t.on === "talk" && t.place === undefined && talk)) continue;
      if (t.place !== undefined) todo.push([id, t.place]);
      else if (t.on === "enter") todo.push([id, t.target!]);
      else if (t.on === "look") {
        for (const p of hotspotIn(t.target!)) todo.push([id, p]);
      }
    }
  };
  seeds(true);
  pass(true);
  entry.clear();
  if (chapter.start) todo.push([chapter.start, null]);
  for (const id of chapter.order) {
    const t = chapter.scenes[id].trigger;
    if (!t) continue;
    const at: string[] =
      t.place !== undefined
        ? [t.place]
        : t.on === "enter"
          ? [t.target!]
          : t.on === "look"
            ? hotspotIn(t.target!)
            : t.on === "talk"
              ? [
                  ...new Set([
                    ...(putIn.get(t.target!) ?? []),
                    ...(putIn.get(
                      chapter.cast.find((c) => c.id === t.target)?.body ?? "",
                    ) ?? []),
                  ]),
                ]
              : [];
    if (at.length === 0) todo.push([id, ANY]);
    for (const p of at) todo.push([id, p]);
  }
  pass(false);
}

/**
 * r22: the places by themselves: every door leads to a place that exists and
 * a mark in it, and every hotspot that sends him somewhere sends him to a
 * mark of its own place.
 */
export function validatePlaces(places: Record<string, PlaceDef>): string[] {
  const out: string[] = [];
  for (const [key, p] of Object.entries(places)) {
    if (p.key !== key) out.push(`${key}: its "key" says ${p.key}`);
    for (const [id, h] of Object.entries(p.hotspots)) {
      if (h.stand && !p.marks[h.stand]) {
        out.push(`${key}.${id}: stands at "${h.stand}", which isn't a mark`);
      }
      if (h.to) {
        const there = places[h.to.place];
        if (!there)
          out.push(`${key}.${id}: leads to "${h.to.place}", no such place`);
        else if (!there.marks[h.to.mark]) {
          out.push(
            `${key}.${id}: arrives at "${h.to.mark}", not a mark in ${h.to.place}`,
          );
        }
      }
    }
  }
  return out;
}

export function errorsOf(problems: Problem[]): Problem[] {
  return problems.filter((p) => p.level === "error");
}

export function formatProblem(p: Problem): string {
  return `${p.level} line ${p.line}${p.scene ? ` (${p.scene})` : ""}: ${p.message}`;
}
