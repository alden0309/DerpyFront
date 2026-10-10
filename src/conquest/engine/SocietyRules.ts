// Society's fixed tables that other modules (and browsers) read without
// pulling in the machinery: forms of government, flag colours and
// divisions, and what a new nation's head is called.

import type { GovForm, Nation, NationFlag } from "./Types";

export const GOV_FORMS: Record<
  GovForm,
  {
    name: string;
    text: string;
    ruler: [string, string];
    fx: Nation["mods"][number]["fx"];
  }
> = {
  republic: {
    name: "Republic",
    text: "No king: the freeholders choose an assembly and the assembly a president. Popular, and it draws settlers.",
    ruler: ["President", "President"],
    fx: { unrest: -3, colonists: 0.1 },
  },
  commonwealth: {
    name: "Commonwealth",
    text: "A Lord Protector and a council of the godly or the able: orderly, and well administered.",
    ruler: ["Lord Protector", "Lady Protector"],
    fx: { admin: 1, unrest: -1 },
  },
  confederacy: {
    name: "Confederacy",
    text: "Free towns and counties bound by a congress: they govern themselves, and pay as little as they can.",
    ruler: ["President of the Congress", "President of the Congress"],
    fx: { unrest: -2, tax: -0.03, morale: 0.05 },
  },
  kingdom: {
    name: "Kingdom",
    text: "A crown of your own making. Taxes come easier; some will call it pride.",
    ruler: ["King", "Queen"],
    fx: { tax: 0.05, unrest: 1 },
  },
};

/** Colours for new nations' flags and maps. */
export const FLAG_COLORS = [
  "#f4efe2",
  "#1d1d1f",
  "#b3202a",
  "#7a1e2c",
  "#e2762b",
  "#e8c14a",
  "#2f6b3a",
  "#5b7f3a",
  "#1f3f8f",
  "#3d7bb8",
  "#5a3b7a",
  "#7b5232",
];

export const FLAG_DIVISIONS: NationFlag["division"][] = [
  "plain",
  "pale",
  "fess",
  "bend",
  "cross",
  "saltire",
  "canton",
  "triband",
  "stripes",
];

/** What the head of a new nation is called. */
export function rulerTitle(n: Nation, female: boolean): string | null {
  return n.gov ? GOV_FORMS[n.gov].ruler[female ? 1 : 0] : null;
}
