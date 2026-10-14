// WORK (r21): the work in the browser. Leaving your work from anywhere (at
// once, in person or by letter, or with a fortnight's notice), and what it
// would come to before you do; a business's staff by name (role, pay,
// promotion; the town's people and other players); a trading company's
// trade and the markets.

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import {
  CO_CUT,
  CO_MOVE,
  goodsName,
  paceDrag,
  placeName,
} from "../../engine/Company";
import {
  askingPay,
  expectedRole,
  fitFor,
  hireGate,
  offerGate,
  prospectOf,
  roleOf,
  roleSkillWords,
  signOdds,
} from "../../engine/Hiring";
import { lifeOfChar, lifeOfSeat, meOf } from "../../engine/LifeQueries";
import { quoteCut } from "../../engine/Markets";
import { NOTICE_DAYS, NOTICE_WORKED, quitView } from "../../engine/Notice";
import { charName } from "../../engine/Queries";
import {
  bizHost,
  roomFor,
  staffAtWork,
  staffCandidates,
  staffFit,
  staffInput,
  staffLadder,
  staffPlace,
  type StartWay,
  startWays,
} from "../../engine/Staff";
import type {
  Character,
  CompanyPlan,
  Hire,
  JobKind,
  Property,
} from "../../engine/Types";
import { action, bar, charLink, type GameUi, provLink } from "./Context";
import { coins, price } from "./Price";
import { term } from "./Terms";

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

// ---------------------------------------------------------------- a business's staff by name

const r1 = (v: number) => Math.round(v * 10) / 10;

/** What the player picked in a form here (kept while the page is open). */
const picked = new Map<string, string | number>();
const pick = <T extends string | number>(key: string, d: T): T =>
  (picked.get(key) as T | undefined) ?? d;
const setPick = (ui: GameUi, key: string, v: string | number) => {
  picked.set(key, v);
  ui.redraw();
};

/** Someone picked from their card to take on ("Offer them work"), shown first. */
let staffFor = -1;

/** From someone's card: take them on at a business of yours (Estate › Business). */
export function openStaffFor(ui: GameUi, c: number): void {
  staffFor = c;
  ui.open({ k: "tab", tab: "estate", sub: "business" });
}

/** The roles a business has room for (and every role someone holds now). */
function rolesHere(pr: Property, keep?: string) {
  return staffLadder(pr.job!).roles.filter(
    (r) => roomFor(pr, r.key) > 0 || r.key === "hand" || r.key === keep,
  );
}

/** A pay picker: − the chip +. */
function payPicker(
  pay: number,
  set: (v: number) => void,
  ask?: number,
): TemplateResult {
  return html`<span
    class="cq-ship-pay"
    title=${ask !== undefined
      ? `They'd ask about ${coins(ask)} a month in this role`
      : ""}
  >
    <button
      class="cq-btn tiny"
      aria-label="Less pay"
      @click=${() => set(Math.max(0.5, r1(pay - 0.5)))}
    >
      −
    </button>
    ${price(pay, { per: "month" })}
    <button
      class="cq-btn tiny"
      aria-label="More pay"
      @click=${() => set(r1(pay + 0.5))}
    >
      +
    </button>
  </span>`;
}

/**
 * A business's staff by name, on its card: each with a role, pay and what
 * they do for it now; the town's people who'd take a place, at the role and
 * pay you choose (whether they'd sign, and why); and a place offered to
 * another player.
 */
export function staffPart(ui: GameUi, pr: Property): TemplateResult {
  const s = ui.s;
  const owner = ui.life!;
  const hires = pr.biz?.roster?.hires ?? [];
  const offers = pr.biz?.roster?.offers ?? [];
  const fx = staffInput(s, owner, pr);
  const pay = r1(hires.reduce((m, h) => m + h.pay, 0));
  const ladder = staffLadder(pr.job!);
  const open = hires.length > 0 || staffFor >= 0;
  return html`<details class="cq-more cq-ship-company cq-staff" ?open=${open}>
    <summary>
      ${term("staff", "Its staff by name")}
      <span class="cq-muted small"
        >${hires.length
          ? html`${hires.length}, ${price(pay, { per: "month" })}`
          : "none yet"}${offers.length
          ? `, ${offers.length} offered`
          : ""}</span
      >
    </summary>
    <p class="small cq-muted">
      Taken on by name, each has a role and the pay you set; promote, demote or
      change it whenever you like. Hands on its staff are among its hands (in
      place of hands from the town).
      ${ladder.roles
        .map((r) => `${r.title}: ${r.text.split(":")[0].replace(/\.$/, "")}`)
        .join("; ")}.
    </p>
    ${hires.length
      ? html`<ul class="cq-ship-roster">
          ${hires.map((h) => staffRow(ui, pr, h))}
        </ul>`
      : nothing}
    ${offers.length
      ? html`<ul class="cq-ship-roster offers">
          ${offers.map((o) => {
            const role = roleOf(ladder, o.role);
            return html`<li>
              <span class="cq-ship-who"
                >${charLink(ui, s.chars[o.c], false)}
                <small
                  >offered ${role?.title.toLowerCase()} at ${coins(o.pay)} a
                  month, till ${formatDate(o.until)}</small
                ></span
              >
              ${action(
                "Take it back",
                { ok: true },
                () =>
                  void ui.cmd({
                    k: "staff",
                    act: "unoffer",
                    id: pr.id,
                    hire: o.id,
                  }),
                "small quiet",
              )}
            </li>`;
          })}
        </ul>`
      : nothing}
    ${fx?.notes.length
      ? html`<ul class="cq-ship-fx small">
          ${fx.notes.map((l) => html`<li>${l}</li>`)}
        </ul>`
      : nothing}
    ${townPart(ui, pr)} ${playersPart(ui, pr)}
  </details>`;
}

/** One on its staff: who, their role (to change), their pay (to change), how they stand. */
function staffRow(ui: GameUi, pr: Property, h: Hire): TemplateResult {
  const s = ui.s;
  const owner = ui.life!;
  const c = s.chars[h.c];
  const ladder = staffLadder(pr.job!);
  const role = roleOf(ladder, h.role)!;
  const fit = staffFit(s, pr, h);
  const ask = c ? askingPay(prospectOf(s, owner, c, ladder), role) : h.pay;
  const at = staffAtWork(s, pr, h);
  const cmd = (x: Record<string, unknown>) =>
    void ui.cmd({ k: "staff", id: pr.id, hire: h.id, ...x } as never);
  return html`<li class=${at ? "" : "away"}>
    <span class="cq-ship-who">
      ${charLink(ui, c, false)}${h.seat
        ? html` <span class="cq-chip player">player</span>`
        : nothing}
      <small
        >${role.title.toLowerCase()} ${fit}
        (${roleSkillWords(role)})${h.seat
          ? at
            ? ", at work"
            : ", not at work"
          : html`, content ${bar(h.loyalty / 100)}`}${(h.owed ?? 0) > 0
          ? html`, <b class="bad">unpaid</b>`
          : nothing}</small
      >
    </span>
    <div class="cq-ship-ctl">
      <select
        class="cq-select small"
        aria-label="Role"
        @change=${(e: Event) =>
          cmd({ act: "role", role: (e.target as HTMLSelectElement).value })}
      >
        ${rolesHere(pr, h.role).map(
          (r) =>
            html`<option value=${r.key} ?selected=${r.key === h.role}>
              ${r.title}
            </option>`,
        )}
      </select>
      ${payPicker(h.pay, (v) => cmd({ act: "pay", pay: v }), ask)}
      ${action(
        "Let go",
        { ok: true },
        () => {
          if (
            confirm(
              `Let ${charName(c)} go?${h.seat ? " It's their work: they lose their place." : ""}`,
            )
          )
            cmd({ act: "dismiss" });
        },
        "small quiet",
      )}
    </div>
  </li>`;
}

/** The town's people who might take a place: whoever would sign, at what. */
function townPart(ui: GameUi, pr: Property): TemplateResult | typeof nothing {
  const s = ui.s;
  const owner = ui.life!;
  const here = !owner.travel && owner.prov === pr.prov;
  const ladder = staffLadder(pr.job!);
  const host = bizHost(s, owner, pr, ui.map);
  let list = here ? staffCandidates(s, ui.w, owner, pr) : [];
  const want = s.chars[staffFor];
  if (
    here &&
    want &&
    !list.includes(want) &&
    want.alive &&
    !lifeOfChar(s, want.id)
  )
    list = [want, ...list];
  else if (want && list.includes(want))
    list = [want, ...list.filter((c) => c !== want)];
  if (!list.length)
    return html`<p class="cq-ship-sub">Take on someone of the town</p>
      <p class="small cq-muted">
        ${here
          ? "Nobody in the town is free to take a place just now."
          : html`Be at ${provLink(ui, pr.prov)} to take on its people.`}
      </p>`;
  const row = (c: Character) => {
    const key = `b${pr.id}:c${c.id}`;
    const p = prospectOf(s, owner, c, ladder);
    const best = expectedRole(p, ladder);
    const roles = rolesHere(pr);
    const roleKey = pick(
      `r:${key}`,
      roles.some((r) => r.key === best.key) ? best.key : "hand",
    );
    const role = roleOf(ladder, roleKey)!;
    const pay = pick(`p:${key}:${roleKey}`, askingPay(p, role));
    const gate = hireGate(s, host, p, roleKey, pay);
    const odds = signOdds(host, p, role, pay);
    const ok = gate.ok && odds.total > 0;
    const worst = [...odds.parts].sort((a, z) => a.value - z.value)[0];
    const skills = Object.entries(p.skills)
      .filter(([, v]) => (v ?? 0) > 0)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ");
    return html`<li class=${c.id === staffFor ? "picked" : ""}>
      <span class="cq-ship-who"
        >${charLink(ui, c, false)}
        <small
          >${skills || "no trade to speak of"}; would look for a place as
          ${best.title.toLowerCase()}; fit for ${role.title.toLowerCase()}:
          ${fitFor(p, role)}</small
        ></span
      >
      <div class="cq-ship-ctl">
        <select
          class="cq-select small"
          aria-label="Role"
          @change=${(e: Event) =>
            setPick(ui, `r:${key}`, (e.target as HTMLSelectElement).value)}
        >
          ${roles.map(
            (r) =>
              html`<option value=${r.key} ?selected=${r.key === roleKey}>
                ${r.title}
              </option>`,
          )}
        </select>
        ${payPicker(pay, (v) => setPick(ui, `p:${key}:${roleKey}`, v))}
        ${action(
          "Take on",
          gate.ok
            ? ok
              ? { ok: true }
              : {
                  ok: false,
                  why: `Won't: ${(worst?.label ?? "").toLowerCase()}`,
                }
            : gate,
          async () => {
            if (
              await ui.cmd({
                k: "staff",
                act: "hire",
                id: pr.id,
                c: c.id,
                role: roleKey,
                pay,
              })
            )
              staffFor = -1;
          },
          `small ${ok ? "primary" : ""}`,
          odds.parts
            .map((x) => `${x.label}: ${x.value > 0 ? "+" : ""}${x.value}`)
            .join("; "),
        )}
      </div>
    </li>`;
  };
  return html`<p class="cq-ship-sub">Take on someone of the town</p>
    <ul class="cq-ship-roster hire">
      ${list.map(row)}
    </ul>`;
}

/** Offer a place to another player: their role and pay, as you set them. */
function playersPart(
  ui: GameUi,
  pr: Property,
): TemplateResult | typeof nothing {
  const s = ui.s;
  const owner = ui.life!;
  const hires = pr.biz?.roster?.hires ?? [];
  const players = s.lives.filter(
    (l) =>
      l.seat !== owner.seat &&
      l.c >= 0 &&
      !l.watching &&
      !hires.some((h) => h.seat === l.seat),
  );
  if (!players.length) return nothing;
  const host = bizHost(s, owner, pr, ui.map);
  const ladder = staffLadder(pr.job!);
  const roles = rolesHere(pr);
  const first = s.chars[staffFor];
  const sorted = first
    ? [
        ...players.filter((l) => l.c === first.id),
        ...players.filter((l) => l.c !== first.id),
      ]
    : players;
  return html`<p class="cq-ship-sub">Offer a place to a player</p>
    <ul class="cq-ship-roster hire">
      ${sorted.map((l) => {
        const key = `b${pr.id}:pl:${l.seat}`;
        const roleKey = pick(`r:${key}`, "hand");
        const role = roleOf(ladder, roleKey)!;
        const pay = pick(`p:${key}:${roleKey}`, role.pay);
        const gate = offerGate(s, host, l, roleKey, pay);
        return html`<li class=${l.c === staffFor ? "picked" : ""}>
          <span class="cq-ship-who"
            >${charLink(ui, meOf(s, l) ?? undefined, false)}
            <span class="cq-chip player">player · ${l.name}</span>
            <small
              >they're asked, and may accept or decline; it's their work
              then</small
            ></span
          >
          <div class="cq-ship-ctl">
            <select
              class="cq-select small"
              aria-label="Role"
              @change=${(e: Event) =>
                setPick(ui, `r:${key}`, (e.target as HTMLSelectElement).value)}
            >
              ${roles.map(
                (r) =>
                  html`<option value=${r.key} ?selected=${r.key === roleKey}>
                    ${r.title}
                  </option>`,
              )}
            </select>
            ${payPicker(pay, (v) => setPick(ui, `p:${key}:${roleKey}`, v))}
            ${action(
              "Offer the place",
              gate,
              async () => {
                if (
                  await ui.cmd({
                    k: "staff",
                    act: "offer",
                    id: pr.id,
                    c: l.c,
                    role: roleKey,
                    pay,
                  })
                )
                  staffFor = -1;
              },
              "small",
            )}
          </div>
        </li>`;
      })}
    </ul>`;
}

/** On Work › Your work: a place on a player's business's staff. */
export function staffBerthLine(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life;
  if (!life) return nothing;
  const at = staffPlace(s, life);
  const bb = life.job?.berth;
  if (!at || !bb) return nothing;
  const { host, pr } = at;
  const h = host.roster.hires.find((x) => x.seat === life.seat);
  const role = h ? roleOf(host.ladder, h.role) : undefined;
  const there = h ? staffAtWork(s, pr, h) : false;
  const owner = lifeOfSeat(s, bb.seat);
  return html`<div class="cq-callout cq-berth">
    <p>
      <b>${bb.title}</b>, ${charName(owner ? meOf(s, owner) : undefined)}'s
      ${pr.name} at ${provLink(ui, pr.prov)}.
      ${price(bb.pay, { gain: true, per: "month" })} from its owner, by the days
      you're at your post
      (${there
        ? "you're at work"
        : html`you're not there: go to ${provLink(ui, pr.prov)}`}).
    </p>
    ${role
      ? html`<p class="small cq-muted">
          ${role.text} Its owner sets your role and pay, and promotes you when
          they like. Leave whenever you like: "Hand in your notice" below.
        </p>`
      : nothing}
  </div>`;
}

// ---------------------------------------------------------------- a new business, both ways

let waysCache: { key: string; list: StartWay[] } = { key: "", list: [] };

/** "+3.2", "−1.5". */
const signedCoins = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${coins(Math.abs(v))}`;

/**
 * In the start window: the plan both ways, minded (by you, or a manager on
 * its staff at their wage) and with nobody minding it, so a business you'd
 * start while working elsewhere isn't judged only as it would go unminded.
 */
export function waysBlock(
  ui: GameUi,
  job: JobKind,
  level: number,
): TemplateResult {
  const life = ui.life!;
  const key = `${ui.s.day}|${life.prov}|${job}|${level}|${life.job?.kind ?? ""}|${life.job?.prov ?? -1}`;
  if (waysCache.key !== key)
    waysCache = { key, list: startWays(ui.s, ui.w, life, job, level) };
  const list = waysCache.list;
  const going = (w: StartWay) => r1(w.plan.going.profit - w.plan.going.mgr);
  const told = (w: StartWay) =>
    w.plan.months[w.plan.months.length - 1]?.cum ?? 0;
  return html`<div class="cq-sb-ways">
    <h5 class="cq-int-group">Both ways: minded, or not</h5>
    <table class="cq-firm-ledger small cq-sb-table">
      <thead>
        <tr>
          <th>Who minds it</th>
          <th>A month, once going</th>
          <th>Paid for itself</th>
          <th>Two years, all told</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(
          (w) =>
            html`<tr class=${w.now ? "now" : ""} title=${w.note}>
              <td>
                <b>${w.label}</b>${w.now
                  ? html` <span class="cq-chip">as things stand</span>`
                  : nothing}
                <span class="cq-muted cq-sb-way-note">${w.note}</span>
              </td>
              <td class=${going(w) < 0 ? "bad" : "good"}>
                ${signedCoins(going(w))}
              </td>
              <td class=${w.plan.breakEven ? "" : "bad"}>
                ${w.plan.breakEven
                  ? `month ${w.plan.breakEven}`
                  : "not in 2 years"}
              </td>
              <td class=${told(w) < 0 ? "bad" : ""}>${signedCoins(told(w))}</td>
            </tr>`,
        )}
      </tbody>
    </table>
    <p class="cq-muted small">
      A manager's pay is in the figures. Once it's yours, take one on from its
      page (Estate › Business, Its staff by name), or put one of your own people
      in to mind it.
    </p>
  </div>`;
}
