// CQ24 (r24): on Society › The war, where history turned: each time players
// changed the course of the Revolution (a battle fought otherwise, a town
// held or taken, a vote lost in Congress), and what it meant, newest first;
// and the course's own words for how it works. The news says so as it
// happens; this keeps the list.

import { html, nothing, type TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import { courseOf } from "../../engine/Campaign1776Core";
import { PEACE_AT, turns } from "../../engine/Campaign1776Course";
import { type GameUi, section } from "./Context";

/** Where history turned (nothing while it hasn't). */
export function turnsSection(ui: GameUi): TemplateResult | typeof nothing {
  const list = turns(ui.s, false);
  const c = courseOf(ui.s);
  if (!list.length && c?.peaceDue === undefined) return nothing;
  return section(
    "Where history turned",
    html`<p class="cq-muted small">
        History keeps its course unless players change it. Here, it has.
        ${c?.peaceDue !== undefined
          ? html`Britain is talking peace: it's expected about
            ${formatDate(c.peaceDue)}.`
          : c?.turned.treaty !== undefined && c.peace === undefined
            ? html`There's been no peace yet: each year of war tires Britain
              more, and it will treat when it's tired enough
              (${Math.round(((c.weary ?? 0) / PEACE_AT) * 100)}% of the way).`
            : nothing}
      </p>
      <ol class="cq-r76-beats">
        ${list.map(
          (t) =>
            html`<li>
              <span class="cq-r76-day">${formatDate(t.day)}</span>
              <p class="small">${t.why}</p>
            </li>`,
        )}
      </ol>`,
  );
}

/** How the course works, in a line for the war's page. */
export function courseNote(): TemplateResult {
  return html`<p class="cq-muted small">
    History keeps its course: the battles, the alliances, the peace and the
    republic's first years come on their dates, and the war's armies move as
    they did, unless players change what happens. A battle where a player
    commands is fought for real; a town a player's army holds has to be taken; a
    vote in Congress can be lost. Then the world follows what happened, and the
    news says history has turned.
  </p>`;
}
