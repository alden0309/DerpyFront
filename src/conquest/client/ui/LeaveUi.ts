// ECON (r17): leave in the browser. On Work › Your work: ask your master for
// leave (how long, their likely answer with its reasons, and the pay), or
// how your leave stands. On a county office: leave of whoever appointed you.
// On the travel choices: when a journey there and back is longer than your
// place allows, "Ask for leave first", with your master's likely answer; for
// a business of your own, the way to a manager.

import { html, nothing, TemplateResult } from "lit";
import { UNMINDED } from "../../engine/Business";
import { formatDate } from "../../engine/Calendar";
import {
  LEAVE_DAYS,
  leaveCheck,
  leaveFor,
  leaveOdds,
  OVERSTAY_SACK,
  tripLeave,
} from "../../engine/Leave";
import { chanceWords } from "../../engine/Odds";
import { charName } from "../../engine/Queries";
import type { LocalOffice } from "../../engine/Types";
import { play } from "../Sound";
import { num } from "../Tip";
import { action, breakdownTip, GameUi } from "./Context";

let pick = 30;

/** Your master's likely answer, with its reasons on a tip. */
function oddsChip(
  ui: GameUi,
  days: number,
  of: "job" | number,
): TemplateResult {
  const life = ui.life!;
  const o = leaveOdds(ui.s, life, days, of);
  if (!o.by)
    return html`<span class="cq-muted small"
      >You give notice: nobody's leave is needed.</span
    >`;
  if (o.player)
    return html`<span class="cq-muted small"
      >${charName(o.by)} is another player: they're asked, and answer for
      themselves.</span
    >`;
  return html`<span class="small"
    >${charName(o.by)} likely gives it:
    ${num(
      chanceWords(o.p),
      () => breakdownTip(`Would ${o.by!.first} give you ${days} days?`, o.why),
      `cq-odds ${o.p >= 0.65 ? "good" : o.p < 0.4 ? "bad" : ""}`,
    )}</span
  >`;
}

/** On leave from your place, or over it: the leave's line says how it stands, not the days away. */
export function leaveCounts(ui: GameUi): boolean {
  return !!ui.life && !!leaveFor(ui.s, ui.life, "job");
}

/** Work › Your work: leave from your place. */
export function leaveBlock(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life;
  const job = life?.job;
  if (!life || !job || life.watching) return nothing;
  if (job.own) {
    const idle = (life.property ?? []).filter(
      (p) =>
        p.kind === "business" &&
        p.prov === job.prov &&
        p.biz?.mgr === undefined,
    );
    return idle.length
      ? html`<p class="cq-leave small">
          You're your own master: no leave to ask. While you're away nobody
          minds your ${idle[0].name.toLowerCase()} (it takes
          ${Math.round(UNMINDED * 10)} in 10 of its takings):
          <button
            class="cq-link"
            @click=${() =>
              ui.open({ k: "tab", tab: "estate", sub: "business" })}
          >
            put a manager in</button
          >.
        </p>`
      : nothing;
  }
  if (job.army >= 0) return nothing;
  const lv = leaveFor(s, life, "job");
  if (lv && s.day <= lv.until)
    return html`<p class="cq-leave on small">
      <b>On leave</b> to ${formatDate(lv.until)} (${lv.until - s.day + 1} days
      left), ${lv.half ? "on half pay" : "without pay"}: you aren't counted
      away. Be back at your post by then.
    </p>`;
  if (lv && s.day > lv.until)
    return html`<p class="cq-leave over small">
      <b>Your leave was up on ${formatDate(lv.until)}</b>: ${s.day - lv.until}
      days over. ${OVERSTAY_SACK} and your place is gone.
    </p>`;
  if (life.leave?.asked)
    return html`<p class="cq-leave small">
      Leave asked of ${charName(s.chars[life.leave.asked.to])}: waiting on the
      answer.
    </p>`;
  const check = leaveCheck(s, life, pick, "job");
  const o = leaveOdds(s, life, pick, "job");
  return html`<div class="cq-leave ask">
    <span class="cq-field"
      ><span>Ask for leave</span>
      <span class="cq-seg small" role="radiogroup" aria-label="Days of leave">
        ${LEAVE_DAYS.map(
          (d) =>
            html`<button
              role="radio"
              aria-checked=${pick === d}
              @click=${() => {
                pick = d;
                ui.redraw();
              }}
            >
              ${d} days
            </button>`,
        )}
      </span></span
    >
    <p class="small">
      ${oddsChip(ui, pick, "job")}
      ${o.by
        ? html`<span class="cq-muted"
            >${o.half ? "On half pay." : "Without pay."}</span
          >`
        : nothing}
    </p>
    ${action(
      `Ask for ${pick} days' leave`,
      check,
      async () => {
        if (await ui.cmd({ k: "econ", act: "leave", days: pick }))
          play("paper");
      },
      "small",
    )}
  </div>`;
}

/** Leave from a county office you hold. */
export function officeLeave(
  ui: GameUi,
  o: LocalOffice,
): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life;
  if (!life || o.holder !== life.c) return nothing;
  const lv = leaveFor(s, life, o.id);
  if (lv && s.day <= lv.until)
    return html`<p class="cq-leave on small">
      On leave from it to ${formatDate(lv.until)}: its duty isn't counted as
      neglected.
    </p>`;
  const days = 60;
  return html`<span class="cq-leave office small">
    ${oddsChip(ui, days, o.id)}
    ${action(
      `Leave for ${days} days`,
      leaveCheck(s, life, days, o.id),
      async () => {
        if (await ui.cmd({ k: "econ", act: "leave", days, of: o.id }))
          play("paper");
      },
      "small quiet",
    )}
  </span>`;
}

/** On the travel choices: a long journey and your place. */
export function tripLeaveLine(
  ui: GameUi,
  to: number,
  days: number,
): TemplateResult | typeof nothing {
  const life = ui.life;
  if (!life) return nothing;
  const t = tripLeave(ui.s, ui.w, life, to, days);
  if (!t) return nothing;
  if (t.kind === "own")
    return html`<p class="cq-leave trip small">
      ${t.text}
      <button
        class="cq-link"
        @click=${() => ui.open({ k: "tab", tab: "estate", sub: "business" })}
      >
        Estate › Business
      </button>
    </p>`;
  const o = t.odds!;
  return html`<div class="cq-leave trip">
    <p class="small">
      <b>Your place:</b> ${t.text}
      ${o.by && !o.player
        ? html`${charName(o.by)} likely gives ${t.days} days' leave:
          ${num(
            chanceWords(o.p),
            () =>
              breakdownTip(
                `Would ${o.by!.first} give you ${t.days} days?`,
                o.why,
              ),
            `cq-odds ${o.p >= 0.65 ? "good" : o.p < 0.4 ? "bad" : ""}`,
          )}.`
        : nothing}
    </p>
    ${action(
      `Ask for leave first (${t.days} days)`,
      t.check ?? { ok: true },
      async () => {
        if (await ui.cmd({ k: "econ", act: "leave", days: t.days }))
          play("paper");
      },
      "small",
    )}
  </div>`;
}
