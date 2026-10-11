// Society's round: each day letters arrive, gatherings happen and
// expeditions land; each month offices are filled and polls held, affairs
// come out, people write and give parties, and you pick up the tongue of
// wherever you're living. And the commands that run it all.

import {
  abandonSettlement,
  askCharter,
  completeSettlement,
  constitute,
  FOUND,
  layInSupplies,
  planSettlement,
  setOut,
  TERMS,
} from "./Founding";
import type { ConquestGame } from "./Game";
import {
  cancelGathering,
  gatheringsDaily,
  gatheringsMonthly,
  hostGathering,
  inviteMore,
  rsvp,
} from "./Gatherings";
import {
  answerLetter,
  npcWrite,
  postDaily,
  postMonthly,
  readLetters,
  writeLetter,
} from "./Letters";
import { affairsMonthly, affairWith, endAffair } from "./Liaisons";
import { travelTo } from "./Life";
import { journal, spend, touchLife } from "./LifeCore";
import { isChildLife, meOf, peopleHere, placesIn } from "./LifeQueries";
import {
  appointerOf,
  appointLocal,
  doDuty,
  eligible,
  ensureOffices,
  OFFICES,
  officesMonthly,
  officeTitle,
  pullLever,
  resignLocal,
  seekAcceptance,
  standLocal,
} from "./Offices";
import { charName } from "./Queries";
import { dice } from "./SocietyCore";
import {
  BOOK_CAP,
  BOOK_COOLDOWN,
  BOOK_POINTS,
  booksHere,
  learnGain,
  learnRate,
  LEVEL_NAMES,
  levelOf,
  lifeTonguePoints,
  LIVING_POINTS,
  provinceTongue,
  tongueName,
  TONGUES,
} from "./Tongues";
import type {
  GatheringKind,
  GovForm,
  LetterKind,
  Life,
  NationFlag,
  PlaceKind,
  SocietyCommand,
  TongueId,
} from "./Types";

// ---------------------------------------------------------------- tongues

/** Learn some of a tongue; returns the points gained. */
export function learnTongue(
  g: ConquestGame,
  life: Life,
  t: TongueId,
  base: number,
  cap = 300,
): number {
  const s = g.s;
  if (life.c < 0 || !TONGUES[t]) return 0;
  const pts = lifeTonguePoints(s, g.map, life);
  const cur = pts[t] ?? 0;
  if (cur >= cap) return 0;
  const young = isChildLife(s, life) ? 1.5 : 1;
  const gain = learnGain(cur, base, learnRate(s, life) * young);
  if (gain <= 0) return 0;
  touchLife(g, life);
  if (!life.tongues || life.tongues.c !== life.c)
    life.tongues = { c: life.c, pts: {} };
  const next = Math.min(cap, Math.round((cur + gain) * 10) / 10);
  life.tongues.pts[t] = next;
  const was = levelOf(cur);
  const now = levelOf(next);
  if (now > was)
    journal(
      g,
      life,
      now === 1
        ? `You've picked up a few words of ${tongueName(t)}: enough to ask the way, and to be laughed at.`
        : now === 2
          ? `You can hold a conversation in ${tongueName(t)} now, slowly.`
          : `You speak ${tongueName(t)} fluently. People forget you weren't born to it.`,
      "good",
    );
  return gain;
}

/** Study a grammar bought here. */
export function studyBook(
  g: ConquestGame,
  life: Life,
  t: TongueId,
): string | null {
  const s = g.s;
  if (life.travel) return "Not on the road.";
  const book = booksHere(s, life.prov).find((b) => b.tongue === t);
  if (!book) return "No such book is sold here.";
  const places = placesIn(s, g.w, life.prov);
  if (!places.includes("market") && !places.includes("press"))
    return "There's no bookseller here.";
  const left = (life.cooldowns[`book:${t}`] ?? 0) - s.day;
  if (left > 0)
    return `You're still working through it (again in ${left} days).`;
  const pts = lifeTonguePoints(s, g.map, life)[t] ?? 0;
  if (pts >= BOOK_CAP)
    return "Books will take you no further: you need people to talk to.";
  if (life.purse < book.cost) return `${book.cost} coins.`;
  spend(g, life, book.cost);
  touchLife(g, life).cooldowns[`book:${t}`] = s.day + BOOK_COOLDOWN;
  const got = learnTongue(g, life, t, BOOK_POINTS, BOOK_CAP);
  journal(
    g,
    life,
    `You buy ${book.title} and work through it by candlelight: ${LEVEL_NAMES[levelOf(pts + got)]} in ${tongueName(t)} (${Math.round(pts + got)} of 300).`,
  );
  return null;
}

/** Living among speakers: a little of their tongue each month. */
function tonguesMonthly(g: ConquestGame): void {
  const s = g.s;
  for (const life of s.lives) {
    if (life.c < 0 || life.watching || life.travel) continue;
    const t = provinceTongue(s, g.map, life.prov);
    if (t) learnTongue(g, life, t, LIVING_POINTS);
  }
}

// ---------------------------------------------------------------- offices offered

/** Someone with an office to give writes to offer it to a player who'd do. */
function officeOffers(g: ConquestGame): void {
  const s = g.s;
  const r = dice(g);
  for (const life of s.lives) {
    const me = meOf(s, life);
    if (!me?.alive || life.watching || isChildLife(s, life)) continue;
    if ((life.cooldowns["office-offer"] ?? 0) > s.day) continue;
    for (const o of s.society?.offices[life.home] ?? []) {
      if (
        o.holder >= 0 ||
        OFFICES[o.key].how === "elected" ||
        o.key === "founder"
      )
        continue;
      if (!eligible(s, life, o).ok) continue;
      const by = s.chars[appointerOf(s, o)];
      if (!by?.alive || s.lives.some((l) => l.c === by.id)) continue;
      if (seekAcceptance(s, life, o, by).total < 10 || !r.chance(0.35))
        continue;
      touchLife(g, life).cooldowns["office-offer"] = s.day + 180;
      npcWrite(
        g,
        life,
        by,
        "news",
        `${me.female ? "Madam" : "Sir"}, the place of ${officeTitle(s, g.w, o)} stands empty, and I can think of nobody fitter. Say the word and the commission is yours. ${charName(by)}.`,
        { ask: true, arg: o.id },
      );
      break;
    }
  }
}

// ---------------------------------------------------------------- the round

export function societyDaily(g: ConquestGame): void {
  const s = g.s;
  postDaily(g);
  gatheringsDaily(g);
  for (const life of s.lives) {
    if (life.c < 0 || life.watching) continue;
    // Counties get their offices when someone comes to live among them.
    if (!life.travel && s.locals[life.prov] && !s.society?.offices[life.prov])
      ensureOffices(g, life.prov);
    // An expedition arrives.
    const f = life.founding;
    if (f?.stage === "underway" && !life.travel && life.prov === f.target)
      completeSettlement(g, life);
  }
}

export function societyMonthly(g: ConquestGame): void {
  const s = g.s;
  officesMonthly(g);
  affairsMonthly(g);
  postMonthly(g);
  gatheringsMonthly(g);
  tonguesMonthly(g);
  officeOffers(g);
  for (const life of s.lives) {
    const f = life.founding;
    if (f?.stage === "planning" && s.day - f.since > FOUND.lapse)
      abandonSettlement(g, life, "two years of talk, and nobody went");
    if (life.constitute && life.constitute.until <= s.day)
      touchLife(g, life).constitute = null;
  }
}

// ---------------------------------------------------------------- commands

export function societyCommand(
  g: ConquestGame,
  life: Life,
  c: SocietyCommand,
): string | null {
  if (!meOf(g.s, life) || life.watching)
    return "You're watching the world now.";
  const id = c.id ?? -1;
  switch (c.act) {
    case "write":
      return writeLetter(
        g,
        life,
        c.c ?? -1,
        (c.kind ?? "") as LetterKind,
        c.arg ?? 0,
        c.about ?? -1,
      );
    case "answer":
      return answerLetter(g, life, id, !!c.yes);
    case "read":
      return readLetters(g, life, c.id);
    case "host":
      return hostGathering(
        g,
        life,
        c.kind as GatheringKind,
        c.venue as PlaceKind,
        c.days ?? 14,
        c.arg ?? 1,
        c.list ?? [],
      );
    case "invite":
      return inviteMore(g, life, id, c.list ?? []);
    case "cancel":
      return cancelGathering(g, life, id);
    case "rsvp":
      return rsvp(g, life, id, !!c.yes);
    case "stand":
      return standLocal(g, life, id);
    case "duty":
      return doDuty(g, life, id);
    case "lever":
      return pullLever(g, life, id, c.arg);
    case "appoint":
      return appointLocal(g, life, id, c.c ?? -1);
    case "resign":
      return resignLocal(g, life, id);
    case "study":
      return studyBook(g, life, c.kind ?? "");
    case "found":
      return planSettlement(g, life, c.p ?? -1, !!c.free, c.arg ?? 1);
    case "terms": {
      const f = life.founding;
      if (!f || f.stage !== "planning")
        return "You're not getting up a settlement.";
      if (!Number.isInteger(c.arg) || c.arg! < 0 || c.arg! >= TERMS.length)
        return "What terms?";
      touchLife(g, life).founding!.terms = c.arg!;
      return null;
    }
    case "supply":
      return layInSupplies(g, life, c.arg ?? 0);
    case "charter":
      return askCharter(g, life);
    case "setout":
      return setOut(g, life, (to) => travelTo(g, life, to, true));
    case "abandon":
      if (!life.founding) return "You're not getting up a settlement.";
      abandonSettlement(g, life, "you gave it up");
      return null;
    case "constitute":
      return constitute(g, life, {
        name: c.name ?? "",
        adjective: c.adjective ?? "",
        color: c.color ?? "",
        flag: c.flag as NationFlag,
        gov: c.gov as GovForm,
        capital: c.p ?? -1,
        offices: c.offices ?? {},
        free: !!c.free,
      });
    case "endaffair": {
      const a = affairWith(life, c.c ?? -1);
      if (!a) return "There's nothing to end.";
      endAffair(g, life, a, "you ended it");
      return null;
    }
    default:
      return "Unknown.";
  }
}

/** People here, for interpreters (kept here so Interactions needn't know Areas). */
export function aroundYou(g: ConquestGame, life: Life) {
  return () => peopleHere(g.s, life.prov, life);
}
