// POWER (r12): one political office at a time. Winning a poll, being
// appointed or accepting a place resigns whatever office you held before.
//
// What counts as a political office: the county and town offices (the
// watch, constable, selectman, mayor, justice, sheriff, county lieutenant,
// burgess, collector, churchwarden; in native towns the council, war
// captain, speaker, sachem and clan mother), a seat in the colony's
// assembly (or at a native council fire), a seat on the governor's council,
// and the governor's (or a native leader's) chair. A burgess's seat in the
// assembly, and the speaker's chair, are part of that one seat.
//
// What doesn't: your work and its ladder (a constable of the watch by trade,
// a sheriff's rank, an officer's commission), a militia rank, a company of
// your own, a place at court (that's only being received), being a
// settlement's proprietor, or leading a rising.

import { seatTitleOf } from "./CouncilTitles";
import type { ConquestGame } from "./Game";
import { journal, milestone } from "./LifeCore";
import { lifeOfChar } from "./LifeQueries";
import type { World } from "./Map";
import { OFFICES, officeName, officeTitle, vacate } from "./Offices";
import { cabinetOf, power, powerChanged } from "./PowerCore";
import type {
  CouncilSeat,
  GameState,
  LocalOffice,
  Nation,
  Seat,
} from "./Types";
import { SEATS } from "./Types";

export type PostKind = "local" | "assembly" | "council" | "governor";

/** One political office someone holds. */
export interface Post {
  kind: PostKind;
  /** The nation it serves. */
  n: number;
  /** How high it stands (the best is kept when there are several). */
  rank: number;
  o?: LocalOffice;
  seat?: CouncilSeat;
}

/** The colony's own seats beyond the old five. */
export const EXTRA_SEATS = ["attorney", "surveyor"] as const;

const shortName = (n: Nation) => n.name.replace(/^the /, "");

/** A seat's title among a nation's people. */
function seatWord(s: GameState, n: number, seat: CouncilSeat): string {
  return seatTitleOf(s.nations[n], seat);
}

/** Every political office a character holds now. */
export function postsOf(s: GameState, c: number): Post[] {
  if (c < 0) return [];
  const out: Post[] = [];
  const burgessOf = new Set<number>();
  for (const list of Object.values(s.society?.offices ?? {}))
    for (const o of list) {
      if (o.holder !== c || o.key === "founder") continue;
      out.push({ kind: "local", n: o.nation, rank: OFFICES[o.key].score, o });
      if (o.key === "burgess") burgessOf.add(o.nation);
    }
  for (const n of s.nations) {
    if (!n.alive) continue;
    if (n.ruler === c && (n.kind === "power" || n.kind === "native"))
      out.push({ kind: "governor", n: n.id, rank: 100 });
    if (n.kind === "power" || n.kind === "native") {
      for (const seat of SEATS)
        if (n.council[seat] === c)
          out.push({ kind: "council", n: n.id, rank: 40, seat });
      const cab = cabinetOf(s, n.id);
      for (const seat of EXTRA_SEATS)
        if (cab && cab[seat] === c)
          out.push({ kind: "council", n: n.id, rank: 40, seat });
    }
    // A burgess's seat in the assembly is the burgess's office.
    const pol = s.polities[n.id];
    if (pol?.assembly.includes(c) && !burgessOf.has(n.id)) {
      const speaker = cabinetOf(s, n.id)?.speaker === c;
      out.push({
        kind: "assembly",
        n: n.id,
        rank: speaker ? 30 : 20,
        ...(speaker ? { seat: "speaker" as const } : {}),
      });
    }
  }
  return out;
}

/** An office's name for the journal and the warnings. */
export function postLabel(s: GameState, w: World, p: Post): string {
  const nation = s.nations[p.n];
  switch (p.kind) {
    case "local":
      return officeTitle(s, w, p.o!);
    case "assembly": {
      const pol = s.polities[p.n];
      if (p.seat === "speaker")
        return `Speaker of ${pol?.name ?? "the assembly"}`;
      return `${nation?.kind === "native" ? "a speaker at" : "a member of"} ${pol?.name ?? "the assembly"}`;
    }
    case "council":
      return `${seatWord(s, p.n, p.seat!)} of ${nation ? shortName(nation) : "the colony"}`;
    case "governor":
      return nation?.kind === "native"
        ? `leader of the ${nation.name}`
        : `governor of ${nation ? shortName(nation) : "the colony"}`;
  }
}

/** What's being taken up: the same office (a re-election) gives up nothing. */
export interface Taking {
  kind: PostKind;
  n: number;
  o?: LocalOffice;
  seat?: CouncilSeat;
}

/** Is a post the very office being taken (or part of it)? */
function samePost(p: Post, t: Taking): boolean {
  if (t.kind === "local") {
    if (p.kind === "local") return p.o!.id === t.o!.id;
    // A burgess sits in the assembly: winning the county's seat keeps it.
    return p.kind === "assembly" && t.o!.key === "burgess" && p.n === t.n;
  }
  if (t.kind === "assembly")
    return (
      (p.kind === "assembly" && p.n === t.n) ||
      (p.kind === "local" && p.o!.key === "burgess" && p.n === t.n)
    );
  if (t.kind === "council")
    return p.kind === "council" && p.n === t.n && p.seat === t.seat;
  return p.kind === "governor" && p.n === t.n;
}

/** The offices you'd have to give up to take this one. */
export function wouldGiveUp(s: GameState, c: number, t: Taking): Post[] {
  return postsOf(s, c).filter((p) => !samePost(p, t));
}

/** "You'd give up being Constable of Jamestown." (or null: nothing to give up). */
export function giveUpWarning(
  s: GameState,
  w: World,
  c: number,
  t: Taking,
): string | null {
  const out = wouldGiveUp(s, c, t);
  if (!out.length) return null;
  return `One office at a time: you'd resign as ${out.map((p) => postLabel(s, w, p)).join(" and as ")}.`;
}

/** Give up one office. */
export function resignPost(
  g: ConquestGame,
  c: number,
  p: Post,
  why: string,
): void {
  const s = g.s;
  const life = lifeOfChar(s, c);
  const label = postLabel(s, g.w, p);
  switch (p.kind) {
    case "local": {
      const o = p.o!;
      // A burgess leaves the assembly with the county's seat.
      if (o.key === "burgess") leaveAssembly(g, c, o.nation);
      // Offices.vacate writes the journal line.
      vacate(g, o, why);
      return;
    }
    case "assembly":
      leaveAssembly(g, c, p.n);
      break;
    case "council": {
      if (p.seat === "attorney" || p.seat === "surveyor") {
        const cab = power(g).cabinets[p.n];
        if (cab) {
          cab[p.seat] = -1;
          powerChanged(g, `c${p.n}`);
        }
      } else {
        const nn = g.nation(p.n);
        nn.council[p.seat as Seat] = -1;
        if (nn.kind === "power" && !nn.court.includes(c)) nn.court.push(c);
      }
      break;
    }
    case "governor":
      // A governor never takes a lesser office (it's refused before it
      // comes to this); nothing to do.
      return;
  }
  if (life) journal(g, life, `You resign as ${label}: ${why}.`, "bad");
  // STORY (r17)
  if (life && life.c === c && s.chars[c]?.alive)
    milestone(g, life, "office", `No longer ${label}: ${why}`, life.prov, {
      quiet: true,
      tone: "bad",
    });
}

function leaveAssembly(g: ConquestGame, c: number, n: number): void {
  const pol = g.s.polities[n];
  if (pol?.assembly.includes(c)) {
    pol.assembly = pol.assembly.filter((x) => x !== c);
    g.politiesChanged(n);
  }
  const cab = g.s.power?.cabinets[n];
  if (cab && cab.speaker === c) {
    cab.speaker = -1;
    powerChanged(g, `c${n}`);
  }
}

/**
 * Someone is about to take an office: they resign every other one first.
 * Call it before the new office is given.
 */
export function takingPost(g: ConquestGame, c: number, t: Taking): void {
  const s = g.s;
  const give = wouldGiveUp(s, c, t);
  if (!give.length) return;
  const what =
    t.kind === "local" && t.o
      ? officeTitle(s, g.w, t.o)
      : postLabel(s, g.w, { ...t, rank: 0 });
  for (const p of give)
    resignPost(g, c, p, `one office at a time, and you're to be ${what}`);
}

/**
 * Anyone holding several offices (an old save, a takeover, a rising won)
 * keeps the best and resigns the rest. Run each day: cheap, and it settles
 * anything at once.
 */
export function oneOfficeSweep(g: ConquestGame): void {
  const s = g.s;
  for (const life of s.lives) {
    if (life.c < 0 || life.watching) continue;
    const posts = postsOf(s, life.c);
    if (posts.length < 2) continue;
    const keep = [...posts].sort(
      (a, b) =>
        b.rank - a.rank ||
        (a.o?.id ?? 0) - (b.o?.id ?? 0) ||
        a.kind.localeCompare(b.kind),
    )[0];
    for (const p of posts) {
      if (p === keep) continue;
      resignPost(
        g,
        life.c,
        p,
        `one office at a time, and you're ${postLabel(s, g.w, keep)}`,
      );
    }
  }
}

/** Whether an unplayed character holds any political office (to fill vacancies with the free). */
export function holdsPost(s: GameState, c: number): boolean {
  return postsOf(s, c).length > 0;
}

/** Someone's best office as a short title ("Sheriff", "Receiver-general"), for nameplates. */
export function postTitle(s: GameState, c: number): string | null {
  const best = [...postsOf(s, c)].sort((a, b) => b.rank - a.rank)[0];
  if (!best) return null;
  switch (best.kind) {
    case "local":
      return officeName(s, best.o!);
    case "council":
      return seatWord(s, best.n, best.seat!);
    case "assembly":
      return best.seat === "speaker"
        ? "Speaker of the house"
        : "Member of the house";
    case "governor":
      return s.nations[best.n]?.kind === "native" ? "Leader" : "Governor";
  }
}

/** A played character's best office, in words (for cards). */
export function bestPostLabel(
  s: GameState,
  w: World,
  c: number,
): string | null {
  const best = [...postsOf(s, c)].sort((a, b) => b.rank - a.rank)[0];
  return best ? postLabel(s, w, best) : null;
}
