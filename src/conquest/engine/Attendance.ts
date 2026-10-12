// INTRIGUE (r15): going to a gathering you're asked to. Say yes to a wedding,
// a ball, a feast or a council somewhere else and you can set out for it: you
// leave in good time (the journey's reckoned by the road or the sea, whichever
// is quicker), travel there on the map with the road's own adventures, arrive
// with a scene of your own, play the evening as a guest (the vignettes), and,
// if you like, come home afterwards. Nothing moves you that you didn't choose:
// setting out is your answer, and coming home is a box you tick.

import type { ConquestGame } from "./Game";
import { gatheringById, gatheringName, GATHERINGS, rsvp } from "./Gatherings";
import { hooks, raiseEvent } from "./Hooks";
import { pickVignette, travelHook } from "./IntrigueEvents";
import { journal, touchLife } from "./LifeCore";
import {
  Check,
  lifeIsNative,
  meOf,
  no,
  paceOf,
  travelRoute,
  yes,
} from "./LifeQueries";
import type { World } from "./Map";
import type { GameState, Gathering, Life } from "./Types";

/** Days to spare on arriving before the day. */
export const SPARE_DAYS = 2;

export interface JourneyView {
  check: Check;
  /** Days on the road, by the quicker way, and by sea or not. */
  days: number;
  sea: boolean;
  /** The fare there (and back, if coming home). */
  fare: number;
  /** The day to set out by. */
  leave: number;
  /** Already there: nothing to travel. */
  here: boolean;
}

/** The quicker way from one town to another for this life. */
export function bestRoute(
  s: GameState,
  w: World,
  life: Life,
  from: number,
  to: number,
): { days: number; cost: number; sea: boolean } | null {
  const native = lifeIsNative(s, life);
  const sailor = life.job?.kind === "sailor";
  const pace = paceOf(s, life);
  const land = travelRoute(s, w.map, from, to, false, native, sailor, pace);
  const sea = travelRoute(s, w.map, from, to, true, native, sailor, pace);
  const pick = [land, sea]
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => a.days - b.days)[0];
  if (!pick) return null;
  return {
    days: Math.ceil(pick.days),
    cost: pick.cost,
    sea: pick === sea && sea.sea.some(Boolean),
  };
}

/** Whether you could go to it, and the journey. */
export function journeyView(
  s: GameState,
  w: World,
  life: Life,
  gat: Gathering | undefined,
  back = true,
): JourneyView {
  const none: JourneyView = {
    check: no("No such gathering."),
    days: 0,
    sea: false,
    fare: 0,
    leave: s.day,
    here: false,
  };
  const me = meOf(s, life);
  if (!gat || !me) return none;
  if (gat.status !== "planned") return { ...none, check: no("It's over.") };
  if (!gat.invited.includes(me.id))
    return { ...none, check: no("You weren't asked.") };
  if (gat.host === me.id) return { ...none, check: no("It's yours.") };
  if (life.attend?.g === gat.id)
    return { ...none, check: no("You're going already.") };
  const from = life.travel ? life.travel.dest : life.prov;
  if (from === gat.prov && !life.travel)
    return {
      check: yes,
      days: 0,
      sea: false,
      fare: 0,
      leave: s.day,
      here: true,
    };
  const r = bestRoute(s, w, life, from, gat.prov);
  if (!r) return { ...none, check: no("There's no way there from here.") };
  const leave = gat.day - r.days - SPARE_DAYS;
  const fare = Math.round(r.cost * (back ? 2 : 1) * 10) / 10;
  let check: Check = yes;
  if (s.day + r.days > gat.day)
    check = no(`It's ${r.days} days away: you'd never get there in time.`);
  else if (life.purse < r.cost)
    check = no(`The fare there is ${r.cost} coins.`);
  return {
    check,
    days: r.days,
    sea: r.sea,
    fare,
    leave: Math.max(s.day, leave),
    here: false,
  };
}

/** Say yes, and go (home after, if you like). */
export function attend(
  g: ConquestGame,
  life: Life,
  id: number,
  back: boolean,
): string | null {
  const s = g.s;
  const gat = gatheringById(s, id);
  const v = journeyView(s, g.w, life, gat, back);
  if (!v.check.ok) return v.check.why;
  const err = rsvp(g, life, id, true);
  if (err) return err;
  if (v.here) {
    journal(
      g,
      life,
      `You'll be at ${gatheringName(s, g.w, gat!).replace(/^The /, "the ")}.`,
    );
    return null;
  }
  touchLife(g, life).attend = {
    g: id,
    from: life.travel ? life.travel.dest : life.prov,
    leave: v.leave,
    back,
    stage: "wait",
  };
  journal(
    g,
    life,
    v.leave <= s.day
      ? `You'll set out at once for ${g.map.provinces[gat!.prov]?.name}: ${v.days} days${v.sea ? " by sea" : ""}.`
      : `You'll set out for ${g.map.provinces[gat!.prov]?.name} in ${v.leave - s.day} days (${v.days} days on the road${v.sea ? ", by sea" : ""}), to be there for ${gatheringName(s, g.w, gat!).replace(/^The /, "the ")}.`,
  );
  attendDaily(g, life);
  return null;
}

/** Change your mind about going (you still said yes: they'll miss you). */
export function stayHome(g: ConquestGame, life: Life): string | null {
  if (!life.attend) return "You're not going anywhere.";
  const gat = gatheringById(g.s, life.attend.g);
  touchLife(g, life).attend = null;
  journal(
    g,
    life,
    gat && gat.status === "planned"
      ? `You won't go to ${gatheringName(g.s, g.w, gat).replace(/^The /, "the ")} after all.`
      : "You stay where you are.",
  );
  return null;
}

/** Each day: set out when it's time, arrive, and come home when it's over. */
export function attendDaily(g: ConquestGame, life: Life): void {
  const a = life.attend;
  if (!a) return;
  const s = g.s;
  const gat = gatheringById(s, a.g);
  const done = !gat || gat.status === "held" || gat.status === "cancelled";
  const clear = (why?: string) => {
    touchLife(g, life).attend = null;
    if (why) journal(g, life, why);
  };
  switch (a.stage) {
    case "wait": {
      if (done) return clear();
      if (s.day < a.leave) return;
      if (life.prov === gat!.prov && !life.travel) {
        a.stage = "there";
        touchLife(g, life);
        return;
      }
      // On the road somewhere else of your own accord: you'll miss it.
      if (life.travel && life.travel.dest !== gat!.prov)
        return clear(
          `You're on the road elsewhere: you'll miss ${gatheringName(s, g.w, gat!).replace(/^The /, "the ")}.`,
        );
      if (life.travel) {
        a.stage = "going";
        touchLife(g, life);
        return;
      }
      const err = travelHook(g, life, gat!.prov);
      if (err)
        return clear(
          `You couldn't set out for ${gatheringName(s, g.w, gat!).replace(/^The /, "the ")}: ${err.replace(/\.$/, "").toLowerCase()}.`,
        );
      a.stage = "going";
      touchLife(g, life);
      return;
    }
    case "going": {
      if (life.travel) {
        if (life.travel.dest !== gat?.prov) clear();
        return;
      }
      if (!gat || life.prov !== gat.prov) return clear();
      a.stage = "there";
      touchLife(g, life);
      if (gat.status === "planned" && gat.day >= s.day)
        raiseEvent(g, life, "intr-arrive", { g: gat.id, c: gat.host });
      return;
    }
    case "there": {
      if (!done) return;
      if (!a.back || life.travel || life.prov === a.from) return clear();
      const err = travelHook(g, life, a.from);
      if (err)
        return clear(
          `You meant to go home, but couldn't: ${err.replace(/\.$/, "").toLowerCase()}.`,
        );
      a.stage = "home";
      touchLife(g, life);
      return;
    }
    case "home":
      if (!life.travel) clear();
      return;
  }
}

/** A vignette of the evening, for a guest (or a host) at a gathering. */
hooks.gatherTurn.push((g, life, gat, here) => pickVignette(g, life, gat, here));

void GATHERINGS;
