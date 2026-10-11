// POWER (r12): what the track adds to a place in town: the newspapers at
// the printing house, the council at the governor's house, and the court
// roll at the governor's house and the watch-house.

import { html } from "lit";
import { seatHolderId, seatsOf, seatTitle } from "../../engine/CouncilTitles";
import { paperOf, papersIn } from "../../engine/Press";
import { charName } from "../../engine/Queries";
import { courtRoll, STAGES } from "../../engine/Trials";
import type { PlaceKind } from "../../engine/Types";
import { charLink, GameUi } from "./Context";
import { frontPage } from "./Gazette";
import type { PlacePart } from "./Livelihood";

export function powerParts(
  ui: GameUi,
  p: number,
  area: PlaceKind,
): PlacePart[] {
  const s = ui.s;
  const life = ui.life;
  const me = ui.me;
  if (!life || !me) return [];
  const out: PlacePart[] = [];
  if (area === "press") {
    const papers = papersIn(s, p);
    const mine = paperOf(s, me.id);
    out.push({
      key: "papers",
      title: "Newspapers",
      count: papers.length,
      note: mine ? `yours: ${mine.name}` : undefined,
      body: html`${papers.map((x) => frontPage(ui, x, 2))}
        <div class="cq-btnrow">
          <button
            class="cq-btn small ${mine ? "primary" : ""}"
            @click=${() => ui.open({ k: "tab", tab: "society", sub: "press" })}
          >
            ${mine
              ? "Your paper"
              : papers.length
                ? "Buy or found a paper"
                : "Found a paper"}
          </button>
        </div>`,
    });
  }
  if (area === "governor") {
    const n = s.provinces[p]?.owner ?? -1;
    const nation = s.nations[n];
    if (
      nation &&
      nation.capital === p &&
      (nation.kind === "power" || nation.kind === "native")
    ) {
      const seats = seatsOf(nation);
      const filled = seats.filter(
        (st) => s.chars[seatHolderId(s, n, st)]?.alive,
      );
      out.push({
        key: "council",
        title: "The council",
        count: filled.length,
        body: html`<ul class="cq-list small">
            ${filled
              .slice(0, 8)
              .map(
                (st) =>
                  html`<li>
                    ${seatTitle(s, n, st)}:
                    ${charLink(ui, s.chars[seatHolderId(s, n, st)], false)}
                  </li>`,
              )}
          </ul>
          <div class="cq-btnrow">
            <button
              class="cq-btn small"
              @click=${() =>
                ui.open({ k: "tab", tab: "society", sub: "council" })}
            >
              The council chamber
            </button>
          </div>`,
      });
    }
  }
  if (area === "governor" || area === "gaol") {
    const roll = courtRoll(s, p).filter((t) => t.stage < 5);
    if (roll.length)
      out.push({
        key: "roll",
        title: "The court roll",
        count: roll.length,
        body: html`<ul class="cq-list small">
          ${roll.map(
            (t) =>
              html`<li>
                ${charName(s.chars[t.defendant])}, ${t.charge}
                <span class="cq-chip gold"
                  >${STAGES[t.stage] ?? "verdict"}</span
                >
              </li>`,
          )}
        </ul>`,
      });
  }
  return out;
}
