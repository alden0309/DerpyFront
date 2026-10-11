// POWER (r12): what the governor's council's seats are called, by the
// people who hold the colony. The five old seats (treasurer, marshal,
// envoy, spymaster, chaplain) keep their keys and do what they always did
// for the colony's government; here they get their colonial titles (the
// spymaster is the colony's secretary, who keeps its letters and its
// secrets), and three seats of the colony's own join them: the attorney
// general, the surveyor-general and the speaker of the assembly.

import { NATIVE_SEAT_NAMES } from "./Rules";
import type { CouncilSeat, GameState, Nation, Seat } from "./Types";

/** The council's seats in the order the chamber shows them. */
export const COUNCIL_ORDER: CouncilSeat[] = [
  "spymaster",
  "treasurer",
  "attorney",
  "surveyor",
  "marshal",
  "envoy",
  "chaplain",
  "speaker",
];

/** What each seat looks after, in a line. */
export const SEAT_PORTFOLIO: Record<CouncilSeat, string> = {
  spymaster:
    "The colony's letters, records and seals, its secrets, and the licensing of the press.",
  treasurer:
    "The treasury: the revenue, the accounts, the customs, and paper money.",
  attorney:
    "The crown's lawyer: prosecutions for the colony, the drafting of its laws.",
  surveyor:
    "The land: surveys, patents and grants, and the boundary lines with the neighbours.",
  marshal:
    "The militia and the forts: musters, regiments and the defence of the frontier.",
  envoy:
    "The native nations and the neighbours: treaties, presents, trade and land.",
  chaplain:
    "The church: days of thanksgiving and fasting, missions, and heresy where the law still hunts it.",
  speaker:
    "The assembly's voice at the council: chosen by the house from its members, not by the governor.",
};

const TITLES: Record<string, Partial<Record<CouncilSeat, string>>> = {
  english: {
    spymaster: "Secretary of the colony",
    treasurer: "Receiver-general",
    attorney: "Attorney general",
    surveyor: "Surveyor-general",
    marshal: "Major-general of the militia",
    envoy: "Commissioner for Indian affairs",
    chaplain: "Commissary of the bishop",
    speaker: "Speaker of the House",
  },
  french: {
    spymaster: "Secrétaire du gouverneur",
    treasurer: "Intendant",
    attorney: "Procureur du roi",
    surveyor: "Grand voyer",
    marshal: "Commandant des troupes",
    envoy: "Agent auprès des nations",
    chaplain: "Grand vicaire",
    speaker: "Doyen du Conseil souverain",
  },
  spanish: {
    spymaster: "Escribano mayor de gobernación",
    treasurer: "Oficial real de la hacienda",
    attorney: "Fiscal",
    surveyor: "Juez de tierras",
    marshal: "Maestre de campo",
    envoy: "Protector de indios",
    chaplain: "Comisario del Santo Oficio",
    speaker: "Alférez real del cabildo",
  },
  dutch: {
    spymaster: "Provincial secretary",
    treasurer: "Receiver-general",
    attorney: "Schout-fiscal",
    surveyor: "Surveyor of the province",
    marshal: "Captain of the soldiery",
    envoy: "Commissary of Indian affairs",
    chaplain: "Dominie of the classis",
    speaker: "President of the Nine Men",
  },
  swedish: {
    spymaster: "Secretary",
    treasurer: "Commissary",
    attorney: "Fiscal",
    surveyor: "Surveyor",
    marshal: "Commander of the fort",
    envoy: "Agent to the River Indians",
    chaplain: "Pastor",
    speaker: "First of the council",
  },
  portuguese: {
    spymaster: "Secretário do governo",
    treasurer: "Provedor da fazenda",
    attorney: "Procurador da coroa",
    surveyor: "Juiz das sesmarias",
    marshal: "Mestre de campo",
    envoy: "Protector dos índios",
    chaplain: "Vigário-geral",
    speaker: "Juiz da câmara",
  },
};

/** A council seat's title in a nation ("Receiver-general", "Intendant", "War chief"). */
export function seatTitleOf(
  nation: Nation | undefined,
  seat: CouncilSeat,
): string {
  if (nation?.kind === "native")
    return seat === "attorney" || seat === "surveyor" || seat === "speaker"
      ? "Elder"
      : NATIVE_SEAT_NAMES[seat as Seat];
  if (nation?.religion === "puritan" && seat === "chaplain")
    return "Teacher of the church";
  if (nation?.religion === "puritan" && seat === "speaker")
    return "Speaker of the deputies";
  return (
    TITLES[nation?.culture ?? "english"]?.[seat] ?? TITLES.english[seat] ?? seat
  );
}

export function seatTitle(s: GameState, n: number, seat: CouncilSeat): string {
  return seatTitleOf(s.nations[n], seat);
}

/** The seats a nation has: the native council fire keeps its five. */
export function seatsOf(nation: Nation | undefined): CouncilSeat[] {
  if (nation?.kind === "native")
    return ["marshal", "envoy", "treasurer", "spymaster", "chaplain"];
  return COUNCIL_ORDER;
}

/** Who sits in a seat now (-1 empty). */
export function seatHolderId(
  s: GameState,
  n: number,
  seat: CouncilSeat,
): number {
  const nation = s.nations[n];
  if (!nation) return -1;
  if (seat === "attorney" || seat === "surveyor" || seat === "speaker")
    return s.power?.cabinets[n]?.[seat] ?? -1;
  return nation.council[seat] ?? -1;
}
