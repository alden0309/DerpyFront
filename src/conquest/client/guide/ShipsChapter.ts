// SHIPS (r21): the How to Play's chapter on ships worth owning: her company
// by name (roles, pay, promotion; other players among them), what each of
// her people does for her, charters at the quay and their odds, a venture of
// your own, her refits, her log and her name, beaching and anchoring where
// there's no port, travelling together, and a stay on the way. Its tables
// are made from the engine's own (ShipsData.ts), so they can't drift.

import { BOATS } from "../../engine/Boats";
import {
  BEACHED,
  CHARTER,
  CHARTER_NAMES,
  CHARTER_TEXT,
  COASTER,
  LIE_DAYS,
  MOOR,
  PASSAGE_RISK,
  REFIT_KEYS,
  REFITS,
  REP,
  ROLE_ROOM,
  SHIP_FX,
  SHIP_ROLES,
  STAY_DAYS,
} from "../../engine/ShipsData";
import type { BoatKind, CharterKind } from "../../engine/Types";
import type { Chapter } from "./Chapters";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const KINDS: BoatKind[] = ["shallop", "sloop", "schooner", "brig", "ship"];

function rolesTable(): string {
  const rows = SHIP_ROLES.map((r) => {
    const skills = Object.entries(r.skills)
      .map(
        ([k, w]) =>
          `${k}${(w ?? 0) < 1 ? ` ${Math.round((w ?? 0) * 100)}%` : ""}`,
      )
      .join(", ");
    const where =
      r.key === "hand"
        ? "every boat with a crew"
        : KINDS.filter((k) => (ROLE_ROOM[k][r.key] ?? 0) > 0)
            .map((k) => BOATS[k].name.toLowerCase())
            .join(", ");
    return `| **${r.title}** | ${r.pay} | ${skills} | ${r.need} | ${where} | ${r.text} |`;
  });
  return `| Role | Going pay a month | Skills that count | Least to take it (the computer's people) | Aboard | What they do |
|---|---|---|---|---|---|
${rows.join("\n")}`;
}

function chartersTable(): string {
  const kinds: CharterKind[] = [
    "freight",
    "passengers",
    "packet",
    "fishing",
    "whaling",
    "smuggling",
    "venture",
  ];
  const pay: Record<CharterKind, string> = {
    freight: `${CHARTER.freight.perLoad} a load and ${CHARTER.freight.per100} a load for every 100 km, on delivery`,
    passengers: `${CHARTER.passengers.perHead} a head and ${CHARTER.passengers.per100} a head for every 100 km, on landing them`,
    packet: `a month by her kind (${KINDS.filter((k) => CHARTER.packet.pay[k])
      .map((k) => `${BOATS[k].name.toLowerCase()} ${CHARTER.packet.pay[k]}`)
      .join(", ")}), ${CHARTER.packet.months} months`,
    fishing: `her own catch, ${CHARTER.fishing.grounds}× her fishing at home, ${CHARTER.fishing.months} months`,
    whaling: `her own catch, by the whaling table, ${CHARTER.whaling.months} months`,
    smuggling: `${CHARTER.smuggling.pay}× a freight's pay; +${CHARTER.smuggling.heat} heat; seized ${pct(CHARTER.smuggling.seized)} of the time at the far port (less with a sly master)`,
    venture: "what the cargo fetches there, less what it cost here",
  };
  return `| Charter | What it is | What it pays |
|---|---|---|
${kinds.map((k) => `| **${CHARTER_NAMES[k]}** | ${CHARTER_TEXT[k]} | ${pay[k]} |`).join("\n")}`;
}

function refitsTable(): string {
  return `| Refit | What it does | Costs (of her price new) |
|---|---|---|
${REFIT_KEYS.map((k) => `| **${REFITS[k].name}** | ${REFITS[k].text}${REFITS[k].since ? ` From ${REFITS[k].since}.` : ""} | ${pct(REFITS[k].cost)} |`).join("\n")}`;
}

export const SHIPS_CHAPTER: Chapter = {
  id: "ships",
  part: "living",
  title: "Ships and their companies",
  line: "Your ship's company by name, charters at the quay, a venture of your own, refits, her name; landing where there's no port; travelling together; a stay on the way.",
  where:
    "Estate › Boats (each ship's card: her company, charters, voyage, refits, log); Here (travelling together, aboard, lying over); Work › Your work (a place in another player's ship).",
  body: `There's no limit to how many boats and ships you own. Each is on Estate › Boats, with all of what follows on her card.

## Her company, by name
Besides her hands signed by the head, you can take people on **by name**, each with a role and the pay you set:

${rolesTable()}

- **The computer's people**: seamen at the quay looking for a berth (a new lot each month) and the town's own seamen. Each says what they're good at and the place they'd look for; choose the role and the pay, and the **Sign on** button says whether they'd sign, and why (the pay against what they'd ask, what they think of you, her name on the waterfront, a role beneath them, and whether they're up to it at all). A better seaman asks more, up to 1.6× the going pay.
- **Other players**: offer them a place, at the role and pay you choose. They're asked in a scene, and may take it or decline. Taken, it's their work: their Work page shows it ("Mate of the *Swallow*"), they're paid from your purse at their month's turn by the days they're at their post (aboard her, or where she lies), and they leave from the usual job menu whenever they like. A player taken on as a hand takes the place of one of her hands by the head.
- **Promote or demote** anyone (pick their role), and **raise or cut their pay**, whenever you like. The computer's people remember it (a promotion or a raise kindly, a demotion or a cut not); a player is told. **Let go** anyone; a player loses their place.
- Unpaid, the computer's people grumble, and after two months (or once they've had enough) go ashore for good.

**Who commands her**: her captain if she has one with her; else you, if you're with her; else your mate as her skipper (People › Your people); else her mate; else her senior hand (seamanship ${SHIP_FX.seniorHand} at least). **She keeps at her work when you leave port**, and can take charters and sail without you: with a captain or a mate of hers, you can send her on charters by word from anywhere. Her takings ride on her master's seamanship (×0.7 with none, ×1.5 at the top); in low spirits (under 30) she brings in ${SHIP_FX.lowSpirits}× as much; her captain's or mate's leadership lifts her spirits up to +${SHIP_FX.spirits} a month. Her card shows what each of her people does for her now.

## Charters at the quay
Every port with a quay has charters each month (${CHARTER.offers.join(", ")} by its size; a great port also has a great lading of ${CHARTER.great.loads.join(", ")} loads for a far port). The same for everyone.

${chartersTable()}

Each shows its **risk and reward before you take it**, from the same tables her passage is rolled from: delivered in time, late (a quarter docked), lost, seized; what it brings a trip and a month after her keep; and what changes the odds. **Send her** (her master has her) or **sail in her yourself** (you command her, and go where she goes). Time allowed is her passage's days ×${CHARTER.dueMul} and ${CHARTER.dueAdd} more; more than ${CHARTER.forfeitDays} days late and the charter's void.

**On a passage**, her own dice: lost ${pct(PASSAGE_RISK.lostPer1000)} for every 1,000 km sailed (half again if she's worn below ${PASSAGE_RISK.worn}%, less with a navigator); late ${pct(PASSAGE_RISK.late)} of the time (days lost to the weather); battered ${pct(PASSAGE_RISK.damage.p)} of the time (−${PASSAGE_RISK.damage.hull[0]} to −${PASSAGE_RISK.damage.hull[1]}); and ${PASSAGE_RISK.wear} off her soundness for every 500 km. With you aboard, the sea's dangers come to you as scenes as well.

**A venture of your own** (cargo choice): choose a good sold here, how many loads, and a port with a market. You pay for it here (your buying makes it dearer here) and she sells it there when she's in (your selling makes it cheaper there); prices move while she sails.

**Send her** anywhere with no charter: home, or to where the charters are.

**Her name on the waterfront** (0 to 100, ${REP.start} at first): +${REP.delivered} for a charter delivered in time, ${REP.late} late, ${REP.forfeit} given up or forfeit, ${REP.seized} seized, ${REP.unpaid} if her crew desert unpaid. A good name pays more (×${CHARTER.repPay} at nothing to ×1.15 at the top) and makes people readier to sign. **Her log** keeps her voyages.

## Refits
${refitsTable()}

At a port with a yard.

## Where there's no port
A small boat (${BEACHED.map((k) => BOATS[k].name.toLowerCase()).join(", ")}) is **beached** on the strand; a brig or a ship **anchors offshore**, and her boat takes you in and out. Either way you land, and leave in her again. Getting her off a beach takes a day more, on the tide; at anchor in an open road she wears ${MOOR.anchorWear} more a month. On a beach you can **careen her** yourself, with no yard: ${pct(MOOR.careenCost)} of a yard's price, up to ${MOOR.careenTo}%.

**On a passage** to a shore with no port, the master runs his ship up on the strand or anchors off, puts you ashore, and **lies there ${LIE_DAYS} days**: you can go back aboard her when you leave. After that, a passing coaster can be **hailed** (about ${COASTER.settled} days' wait on a settled shore, ${COASTER.wild} in open country): the days are in "The road there". An island without a port strands nobody.

## Travelling together
Ask another player in the same place whether you may **travel with them**, or ask them to **travel with you** (Here, under "In town"). They're asked, and may agree or not. Once agreed, wherever the leader sets out for from where you both are, the others go too: in the leader's own boat for nothing (a berth each, as many as she has), on a passage or the road paying their own way. Anyone can go their own way whenever they like, and **get off at the next stop** on the way.

Everyone of her company who's at her port goes aboard when she sails, and comes in with her.

## A stay on the way
Sailing your own ship (or her captain aboard, if he's a player), you can **lie over** at the next port on the way, for as long as you like. If she sails again within ${STAY_DAYS} days of coming in, **the voyage goes on** to where she was going, her charter and those aboard with her. After that, the voyage is over (a charter's forfeit).

> Tip: A captain earns his pay on a brig or a ship (her takings ride on his seamanship), less on a sloop. A navigator pays for himself on long passages; a bosun on a big ship that's always at sea. Look at a charter's odds before you take it: a smuggling run pays twice and more, and sometimes loses her.`,
  glossary: [
    [
      "Bosun",
      "A ship's petty officer in charge of her rigging, hull and hands.",
      "ships",
    ],
    [
      "Careen",
      "To heave a ship down on a beach to scrape and pay her bottom.",
      "ships",
    ],
    [
      "Charter party",
      "The contract that hires a ship: a cargo, passengers, or a season's work.",
      "ships",
    ],
    [
      "Packet",
      "A ship running the post and passengers between two ports on a schedule.",
      "ships",
    ],
    [
      "Lying over",
      "A ship stopped at a port on the way; the voyage can go on within two months.",
      "ships",
    ],
  ],
};
