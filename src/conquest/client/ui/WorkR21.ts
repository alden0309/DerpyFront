// WORK (r21): the work in the browser. Leaving your work from anywhere (at
// once, in person or by letter, or with a fortnight's notice), and what it
// would come to before you do.

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import {
  CO_CUT,
  CO_MOVE,
  goodsName,
  paceDrag,
  placeName,
} from "../../engine/Company";
import { quoteCut } from "../../engine/Markets";
import { NOTICE_DAYS, NOTICE_WORKED, quitView } from "../../engine/Notice";
import type { CompanyPlan } from "../../engine/Types";
import { action, type GameUi } from "./Context";

// ---------------------------------------------------------------- leaving your work

/** Whether the "Hand in your notice" panel is open (kept while the page is). */
let quitOpen = false;

/** Open the panel on the Work page (from Here's button). */
export function openQuit(ui: GameUi): void {
  quitOpen = true;
  ui.open({ k: "tab", tab: "work" });
}

/**
 * The job menu's way out: the button, and when it's opened the two ways to
 * go (a fortnight's notice, or at once: in person or by letter), what each
 * comes to; while notice runs, when you leave and taking it back.
 */
export function quitBlock(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const v = quitView(s, ui.w, life);
  const job = life.job;
  if (!job) return html``;
  if (v.leaving)
    return html`<div class="cq-quit cq-callout small" role="status">
      <p>
        <b>You've given notice.</b> You leave on ${formatDate(v.leaving.until)}
        (${v.leaving.done} of the ${NOTICE_WORKED} working days that see it
        worked out, so far). Until then you're paid as before.
      </p>
      <div class="cq-btnrow">
        ${action(
          "Stay on after all",
          { ok: true },
          () => void ui.cmd({ k: "quit", how: "stay" }),
          "small",
        )}
        ${action(
          v.how === "letter" ? "Leave now, by letter" : "Leave now",
          { ok: true },
          () => {
            if (confirm("Leave at once, without working out your notice?"))
              void ui.cmd({ k: "quit", how: "now" });
          },
          "small quiet",
        )}
      </div>
    </div>`;
  if (!v.check.ok)
    return action(v.label, v.check, () => undefined, "small quiet");
  if (v.how === "own")
    return action(
      v.label,
      { ok: true },
      () => {
        if (confirm(`${v.text} Give it up?`))
          void ui.cmd({ k: "quit", how: "now" });
      },
      "small quiet",
    );
  if (!quitOpen)
    return action(
      `${v.label}…`,
      { ok: true },
      () => {
        quitOpen = true;
        ui.redraw();
      },
      "small quiet",
    );
  const now =
    v.how === "letter"
      ? "Leave at once, by letter"
      : v.how === "person"
        ? "Leave at once"
        : "Leave at once";
  return html`<div class="cq-quit cq-callout small">
    <p><b>Leaving your place.</b> ${v.text}</p>
    <div class="cq-btnrow">
      ${action(
        `Give a fortnight's notice`,
        v.notice,
        () => {
          quitOpen = false;
          void ui.cmd({ k: "quit", how: "notice" });
        },
        "small primary",
        `You work ${NOTICE_DAYS} more days (and are paid for them), then leave. Worked out (${NOTICE_WORKED} working days at your post), your master remembers it kindly.`,
      )}
      ${action(
        now,
        { ok: true },
        () => {
          quitOpen = false;
          void ui.cmd({ k: "quit", how: "now" });
        },
        `small ${v.lurch ? "risky" : "quiet"}`,
        v.lurch
          ? "Your master remembers being left in the lurch (−10, for two years)."
          : "You go today.",
      )}
      <button
        class="cq-btn small quiet"
        @click=${() => {
          quitOpen = false;
          ui.redraw();
        }}
      >
        Not now
      </button>
    </div>
    ${v.lurch
      ? html`<p class="cq-muted">
          Leaving at once after ${job.months}
          month${job.months === 1 ? "" : "s"}: your master remembers being left
          in the lurch.
        </p>`
      : nothing}
  </div>`;
}

// ---------------------------------------------------------------- a company and the markets

/**
 * What a trading company's own buying and selling do to the ports' prices,
 * load for load as a person's would: its cargo bought at its port (dearer
 * there after), sold where it's sent (cheaper there after), and what its pace
 * keeps the prices at against it once it's going.
 */
export function companyMarkets(
  ui: GameUi,
  plan: CompanyPlan,
): TemplateResult | typeof nothing {
  const s = ui.s;
  const w = ui.w;
  if (plan.loads <= 0) return nothing;
  const lines: string[] = [];
  const name = goodsName(plan.item).toLowerCase();
  if (plan.from >= 0) {
    const q = quoteCut(
      s,
      w,
      plan.from,
      plan.item,
      plan.loads,
      CO_CUT,
      s.day,
      CO_MOVE,
    );
    lines.push(
      `Buying ${plan.loads} loads at ${placeName(s, w, plan.from, plan.from)} puts the price of ${name} there up from ${q.before} to ${q.after} a load (as buying them yourself would).`,
    );
  }
  if (plan.to >= 0) {
    const q = quoteCut(
      s,
      w,
      plan.to,
      plan.item,
      -plan.loads,
      CO_CUT,
      s.day,
      CO_MOVE,
    );
    lines.push(
      `Selling them at ${placeName(s, w, plan.to, plan.from)} brings the price there down from ${q.before} to ${q.after}.`,
    );
  } else
    lines.push(
      "Europe's merchants are many: a cargo hardly moves their prices.",
    );
  const drag = paceDrag(s, w, plan);
  if (drag.buy > 0.01 || drag.sell > 0.01)
    lines.push(
      `At a cargo every ${plan.every === 1 ? "month" : `${plan.every} months`}, its own trade keeps them ${drag.buy > 0.01 ? `about ${Math.round(drag.buy * 100)} in a hundred dearer to buy` : ""}${drag.buy > 0.01 && drag.sell > 0.01 ? " and " : ""}${drag.sell > 0.01 ? `about ${Math.round(drag.sell * 100)} in a hundred cheaper to sell` : ""} (a market takes about three months to ease back).`,
    );
  return html`<p class="cq-co-markets small cq-muted">
    <b>Its trade and the markets.</b> ${lines.join(" ")}
  </p>`;
}
