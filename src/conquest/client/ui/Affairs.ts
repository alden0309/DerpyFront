// Your affairs: the work you do and the ladder above you, the army you serve
// in or command, the offices you hold and the road to more, the colony you
// govern (if it comes to that), the cause you've sworn to, and Europe.

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import {
  atPost,
  heirOf,
  isChildLife,
  jobTitle,
  lifeIsNative,
  officesOf,
  opinionOf,
  promotionView,
  wageOf,
} from "../../engine/LifeQueries";
import {
  AWAY_MONTHS,
  COMMAND_RANK,
  EUROPE_FORTUNE,
  JOBS,
  PLACES,
} from "../../engine/LifeRules";
import {
  activeMovements,
  foundCheck,
  foundTarget,
  GOAL_NAMES,
  GOAL_TEXT,
  movementOf,
  RISE_MEMBERS,
  RISE_SUPPORT,
  riseCheck,
} from "../../engine/Movements";
import { ELECTION_YEARS, governorScore } from "../../engine/Politics";
import {
  armyMen,
  buildCheck,
  charName,
  enemiesOf,
  peaceCheck,
  peaceWillingness,
  provincesOf,
  recruitCheck,
  warCheck,
} from "../../engine/Queries";
import { SEAT_NAMES, TAX_NAMES } from "../../engine/Rules";
import type {
  BuildingKind,
  GovLever,
  Movement,
  MovementGoal,
  TaxLevel,
} from "../../engine/Types";
import { SEATS } from "../../engine/Types";
import "../Range";
import { BUILDING_LABELS, nationName } from "../Text";
import { num } from "../Tip";
import {
  action,
  bar,
  breakdownTip,
  charLink,
  GameUi,
  more,
  nationLink,
  provLink,
  section,
} from "./Context";

export function affairsTab(ui: GameUi): TemplateResult {
  const life = ui.life;
  const me = ui.me;
  if (!life || !me)
    return html`<p class="cq-empty">
      You're watching. Take over someone, or begin a new life.
    </p>`;
  return html`<header class="cq-panel-head">
      <h2 class="cq-h1">Your affairs</h2>
      <p class="cq-muted small">
        Work, the army, office, causes, and the voyage home.
      </p>
    </header>
    ${workSection(ui)} ${armySection(ui)} ${standingSection(ui)}
    ${governingSection(ui)} ${causeSection(ui)} ${europeSection(ui)}`;
}

// ---------------------------------------------------------------- work

function workSection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const job = life.job;
  if (isChildLife(s, life))
    return section(
      "Work",
      html`<p class="cq-muted">
        Children don't work for wages here (much). At sixteen the trades open to
        you; until then, learn what you can.
      </p>`,
    );
  if (!job)
    return section(
      "Work",
      html`<p>You have no work.</p>
        <p class="cq-muted small">
          Places offer work: farms, mills, forts, docks, counting houses,
          churches and the council fire. Look under Here for what's on offer
          where you are, or travel to find better.
        </p>`,
    );
  const def = JOBS[job.kind];
  const v = promotionView(s, life);
  const wage = wageOf(s, ui.w, life);
  const here = atPost(s, ui.w, life);
  const boss = s.chars[job.employer];
  const servant = job.kind === "servant" && (job.until ?? 0) > s.day;
  return section(
    "Work",
    html`<div class="cq-work">
        <p class="cq-work-title">
          <b>${jobTitle(life)}</b>
          <span class="cq-muted small"
            >${def.name.toLowerCase()} at
            ${PLACES[job.place].name.replace(/^The /, "the ")},
            ${provLink(ui, job.prov)}</span
          >
        </p>
        <p class="small">
          ${wage > 0
            ? html`Paid <b>${wage}</b> a month.`
            : html`<span class="bad"
                >Unpaid while you're away from your post.</span
              >`}
          ${boss?.alive ? html`Your master: ${charLink(ui, boss)}.` : nothing}
          ${job.nation >= 0
            ? html`In the service of ${nationLink(ui, job.nation)}.`
            : nothing}
          Since ${formatDate(job.since)}.
        </p>
        ${!here && job.army < 0
          ? html`<p class="cq-warn small">
              You're away from your post (${job.away} of ${AWAY_MONTHS} months
              before you're let go).
            </p>`
          : nothing}
        ${servant
          ? html`<p class="cq-muted small">
              Bound by indenture until ${formatDate(job.until!)}: no wages but
              keep, and freedom dues at the end.
            </p>`
          : nothing}
        <ol class="cq-ladder" aria-label="The ladder">
          ${def.ranks.map(
            (r, i) =>
              html`<li
                class="${i < job.rank ? "past" : ""} ${i === job.rank
                  ? "now"
                  : ""}"
              >
                <span class="cq-rung-title">${r.title}</span>
                <span class="cq-muted small"
                  >${r.wage ? `${r.wage}/mo` : "keep"}${r.buy
                    ? `, ${r.buy.cost} to buy`
                    : ""}${r.commission ? ", by commission" : ""}</span
                >
              </li>`,
          )}
        </ol>
        ${v.next
          ? html`<div class="cq-next">
              <p>
                Next: <b>${v.next.title}</b>.
                ${v.check.ok
                  ? html`<span class="good"
                      >You're ready: promotion comes with a good month's
                      work${v.next.buy
                        ? html`, or buy it at the
                          ${PLACES[job.place].name
                            .replace(/^The /, "")
                            .toLowerCase()}
                          now`
                        : ""}.</span
                    >`
                  : nothing}
              </p>
              <ul class="cq-needs">
                ${v.needs.map(
                  (n) =>
                    html`<li class=${n.met ? "met" : ""}>
                      ${n.met ? "✓" : "○"} ${n.label}
                    </li>`,
                )}
              </ul>
            </div>`
          : html`<p class="cq-muted small">The top of this ladder.</p>`}
        <div class="cq-btnrow">
          ${action(
            "Leave this work",
            servant
              ? {
                  ok: false,
                  why: "Bound by indenture (you could run away from the farm)",
                }
              : { ok: true },
            () => {
              if (
                confirm(`Leave your place as ${jobTitle(life).toLowerCase()}?`)
              )
                void ui.cmd({ k: "quit" });
            },
            "small quiet",
          )}
        </div>
      </div>
      <p class="cq-muted small">${def.text}</p>`,
  );
}

// ---------------------------------------------------------------- the army

function armySection(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const job = life.job;
  const leads = s.armies.find((a) => a.commander === me.id);
  const soldier = job && (job.kind === "soldier" || job.kind === "warrior");
  const n = s.nations[me.nation];
  const marshal = n?.council.marshal === me.id || n?.ruler === me.id;
  if (!leads && !soldier && !marshal) return nothing;
  const marching =
    job && job.army >= 0 ? s.armies.find((a) => a.id === job.army) : undefined;
  const need = job ? COMMAND_RANK[job.kind] : undefined;
  return section(
    "Under arms",
    html`${leads
      ? html`<div class="cq-callout">
          <p>
            You command the ${s.nations[leads.owner].adjective} army:
            <b>${Math.round(armyMen(leads))}</b> men at
            ${provLink(ui, leads.prov)}${leads.depart >= 0 && leads.path.length
              ? html`, marching to
                ${provLink(ui, leads.path[leads.path.length - 1])}`
              : nothing}.
          </p>
          <div class="cq-btnrow">
            <button
              class="cq-btn primary small"
              ?disabled=${leads.retreating}
              @click=${() => ui.pickMarch()}
            >
              March to…
            </button>
            <button
              class="cq-btn small"
              @click=${() => ui.open({ k: "army", id: leads.id })}
            >
              The army
            </button>
            <button
              class="cq-btn small quiet"
              @click=${() => void ui.cmd({ k: "command", army: -1 })}
            >
              Give up the command
            </button>
          </div>
        </div>`
      : marching
        ? html`<p>
            You march with the ${s.nations[marching.owner].adjective} army
            (${Math.round(armyMen(marching))} men) at
            ${provLink(ui, marching.prov)}. Where it goes, you go; when it
            fights, you fight.
            <button
              class="cq-link"
              @click=${() => ui.open({ k: "army", id: marching.id })}
            >
              The army
            </button>
          </p>`
        : soldier
          ? html`<p class="cq-muted">
              In garrison. When an army of yours musters where you serve, you
              fall in with it.
            </p>`
          : nothing}
    ${!leads
      ? html`<p class="cq-muted small">
          ${need !== undefined && soldier
            ? html`At
              ${JOBS[job!.kind].ranks[need]?.title.toLowerCase() ?? "high rank"}
              you may take command of an army where it stands (at its fort or
              council fire).`
            : html`As ${marshal ? "marshal or governor" : "an officer"} you may
              take command of an army where it stands.`}
        </p>`
      : nothing}`,
  );
}

// ---------------------------------------------------------------- office and standing

function standingSection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const n = s.nations[me.nation];
  const native = lifeIsNative(s, life);
  const offices = officesOf(s, me.id);
  const pol = s.polities[me.nation];
  const ruler = s.chars[n?.ruler ?? -1];
  const rulerOp =
    ruler?.alive && ruler.id !== me.id ? opinionOf(s, ruler, life) : null;
  const atCourt = n?.court.includes(me.id);
  const score = governorScore(s, life);
  return section(
    "Standing",
    html`<div class="cq-stats">
        <div class="cq-stat">
          <span class="cq-stat-label">Renown</span
          ><span class="cq-stat-value">${Math.round(life.renown)}</span>
          <span class="cq-stat-note">who knows your name</span>
        </div>
        <div class="cq-stat">
          <span class="cq-stat-label"
            >${native ? "Elders' regard" : "Favour at home"}</span
          ><span class="cq-stat-value">${Math.round(life.favor)}</span>
          <span class="cq-stat-note"
            >${native ? "the council fire" : "the crown's ear"}</span
          >
        </div>
        ${rulerOp
          ? html`<div class="cq-stat">
              <span class="cq-stat-label"
                >${native ? "Your leader" : "The governor"}</span
              >
              ${num(
                `${rulerOp.total > 0 ? "+" : ""}${rulerOp.total}`,
                () =>
                  breakdownTip(`What ${ruler!.first} thinks of you`, rulerOp),
                `cq-stat-value ${rulerOp.total >= 15 ? "good" : rulerOp.total < 0 ? "bad" : ""}`,
              )}
              <span class="cq-stat-note">${charName(ruler)}</span>
            </div>`
          : nothing}
      </div>
      ${offices.length
        ? html`<ul class="cq-offices">
            ${offices.map(
              (o) =>
                html`<li>
                  <b>${o.label}</b>
                  <span class="cq-muted small"
                    >${o.stipend ? `${o.stipend} a month` : "unpaid"}</span
                  >
                </li>`,
            )}
          </ul>`
        : html`<p class="cq-muted">
            You hold no
            office${atCourt ? ", but you're received at court" : ""}.
          </p>`}
      ${pol
        ? html`<p class="small">
            <b>${pol.name}</b>: ${pol.assembly.length} of ${pol.seats} seats
            filled; ${native ? "the council fire chooses again" : "elections"}
            every ${ELECTION_YEARS} years, next on ${formatDate(pol.election)}.
            ${life.campaign
              ? html`<span class="good"
                  >You're standing: ${life.campaign.points} campaign
                  points.</span
                >`
              : nothing}
          </p>`
        : nothing}
      ${more(
        native
          ? "The road to leading your people"
          : "The road to the governor's chair",
        html`<ol class="cq-road">
            ${native
              ? html`<li>
                    Win renown (hunts, raids, councils, treaties) and become a
                    speaker at the council fire, or a war chief.
                  </li>
                  <li>
                    Sit at the council fire (stand there when it chooses: renown
                    15).
                  </li>
                  <li>
                    When a council seat falls empty, the leader may offer it to
                    a warrior of rank or a speaker of renown.
                  </li>
                  <li>
                    When the leader dies, the elders choose: someone of great
                    renown and regard (you're at <b>${Math.round(score)}</b>;
                    they look for about 70 and more than the council's best).
                  </li>`
              : html`<li>
                    Make something of yourself: property, a trade, renown (20),
                    or 40 coins in your purse.
                  </li>
                  <li>
                    Stand for ${pol?.name ?? "the assembly"} at the governor's
                    house; canvass, treat the voters, print broadsides.
                  </li>
                  <li>
                    Seek a place at court (the governor's house at the capital:
                    renown 20 and the governor's good opinion, 15).
                  </li>
                  <li>
                    When a council seat falls empty, the governor may offer it
                    to someone at court he likes.
                  </li>
                  <li>
                    When the governor dies or is recalled, the crown appoints a
                    successor: someone of renown, favour and office (you're at
                    <b>${Math.round(score)}</b>; the crown looks for about 100
                    and more than the council's best). Write letters home to win
                    favour.
                  </li>`}
          </ol>
          ${n
            ? html`<h4 class="cq-h4">
                  ${native ? "The council fire" : "The council"} of
                  ${nationName(n.name)}
                </h4>
                <dl class="cq-family">
                  <dt>${native ? "Leader" : "Governor"}</dt>
                  <dd>${charLink(ui, ruler)}</dd>
                  ${SEATS.map((seat) => {
                    const c = s.chars[n.council[seat]];
                    return html`<dt>${SEAT_NAMES[seat]}</dt>
                      <dd>
                        ${c?.alive
                          ? charLink(ui, c)
                          : html`<span class="cq-muted">empty</span>`}
                      </dd>`;
                  })}
                </dl>`
            : nothing}`,
      )}`,
  );
}

// ---------------------------------------------------------------- governing

const BUILDABLE: BuildingKind[] = [
  "fort",
  "church",
  "farm",
  "port",
  "courthouse",
];

function governingSection(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const me = ui.me!;
  const n = s.nations.findIndex((x) => x.alive && x.ruler === me.id);
  if (n < 0) return nothing;
  const nation = s.nations[n];
  if (nation.kind === "rebels")
    return section(
      "The rising",
      html`<p>
        You lead ${nation.name}. Command its army (Under arms) and march on the
        enemy's capital; hold out and win, or hang.
      </p>`,
    );
  const native = nation.kind === "native";
  const lever = (l: GovLever) => ui.cmd({ k: "gov", lever: l });
  const provs = provincesOf(s, n);
  const enemies = enemiesOf(s, n);
  const neighbours = new Set<number>();
  for (const p of provs)
    for (const [q] of ui.map.provinces[p].nb) {
      const o = s.provinces[q].owner;
      if (o >= 0 && o !== n) neighbours.add(o);
    }
  const pick = (cls: string) =>
    Number(document.querySelector<HTMLSelectElement>(`.${cls}`)?.value ?? -1);
  const raiseType = native ? "warriors" : "militia";
  return section(
    native
      ? `Leading the ${nation.name}`
      : `Governing ${nationName(nation.name)}`,
    html`<p class="cq-muted small">
        The council and the clerks run the colony day to day. These are the few
        things that wait on your word. Treasury:
        <b>${Math.round(nation.gold)}</b>.
      </p>
      ${!native
        ? html`<div class="cq-lever">
              <span class="cq-lever-label">Taxes</span>
              <div class="cq-seg" role="radiogroup" aria-label="Taxes">
                ${TAX_NAMES.map(
                  (t, i) =>
                    html`<button
                      role="radio"
                      aria-checked=${nation.tax === i}
                      @click=${() => lever({ l: "tax", level: i as TaxLevel })}
                    >
                      ${t}
                    </button>`,
                )}
              </div>
            </div>
            ${!nation.independent
              ? html`<div class="cq-lever">
                  <cq-range
                    label="Sent home to the crown"
                    .min=${0}
                    .max=${50}
                    .step=${5}
                    .value=${Math.round(nation.remit * 100)}
                    .format=${(v: number) => `${v}% of revenue`}
                    @cq-change=${(e: CustomEvent<number>) =>
                      lever({ l: "remit", share: e.detail / 100 })}
                  ></cq-range>
                  <p class="cq-muted small">
                    More pleases the crown (favour); less keeps the colony rich.
                  </p>
                </div>`
              : nothing}
            <div class="cq-lever">
              <span class="cq-lever-label">Build</span>
              <select class="cq-select gov-build-p" aria-label="Where">
                ${provs.map(
                  (p) =>
                    html`<option value=${p}>
                      ${ui.map.provinces[p].name}
                    </option>`,
                )}
              </select>
              <select class="cq-select gov-build-b" aria-label="What">
                ${BUILDABLE.map(
                  (b) =>
                    html`<option value=${b}>${BUILDING_LABELS[b]}</option>`,
                )}
              </select>
              <button
                class="cq-btn small"
                @click=${() => {
                  const p = pick("gov-build-p");
                  const b = (document.querySelector<HTMLSelectElement>(
                    ".gov-build-b",
                  )?.value ?? "fort") as BuildingKind;
                  const check = buildCheck(s, ui.w, n, p, b);
                  if (!check.ok) ui.toast(check.why, "bad");
                  else void lever({ l: "build", p, b });
                }}
              >
                Order it
              </button>
            </div>`
        : nothing}
      <div class="cq-lever">
        <span class="cq-lever-label">Call out the ${raiseType}</span>
        <select class="cq-select gov-raise-p" aria-label="Where">
          ${provs.map(
            (p) =>
              html`<option value=${p}>${ui.map.provinces[p].name}</option>`,
          )}
        </select>
        <button
          class="cq-btn small"
          @click=${() => {
            const p = pick("gov-raise-p");
            const check = recruitCheck(s, n, p, raiseType);
            if (!check.ok) ui.toast(check.why, "bad");
            else void lever({ l: "raise", p });
          }}
        >
          Raise
        </button>
      </div>
      <div class="cq-lever">
        <span class="cq-lever-label">War</span>
        <select class="cq-select gov-war-n" aria-label="On whom">
          ${[...neighbours].map(
            (o) =>
              html`<option value=${o}>
                ${nationName(s.nations[o].name)}
              </option>`,
          )}
        </select>
        <button
          class="cq-btn small danger"
          ?disabled=${neighbours.size === 0}
          @click=${() => {
            const o = pick("gov-war-n");
            const check = warCheck(s, n, o);
            if (!check.ok) ui.toast(check.why, "bad");
            else if (
              confirm(`Declare war on ${nationName(s.nations[o].name)}?`)
            )
              void lever({ l: "war", n: o });
          }}
        >
          Declare war
        </button>
      </div>
      ${enemies.length
        ? html`<ul class="cq-list">
            ${enemies.map((o) => {
              const terms = { take: [], give: [], gold: 0 };
              const will = peaceWillingness(s, n, o, terms);
              return html`<li>
                At war with ${nationLink(ui, o)}.
                ${num(
                  will.total >= 0 ? "They'd take peace" : "They'd refuse peace",
                  () =>
                    breakdownTip(
                      "Would they accept peace as things stand?",
                      will,
                    ),
                )}
                ${action(
                  "Offer peace",
                  peaceCheck(s, n, o, terms),
                  () => void lever({ l: "peace", n: o }),
                  "small",
                  undefined,
                  false,
                )}
              </li>`;
            })}
          </ul>`
        : nothing}`,
  );
}

// ---------------------------------------------------------------- the cause

function causeSection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const me = ui.me!;
  const m = movementOf(s, me.id);
  const others = activeMovements(s).filter((x) => x !== m);
  return section(
    "Causes",
    html`${m ? movementCard(ui, m, true) : foundBlock(ui)}
      ${others.length
        ? more(
            `Other causes abroad (${others.length})`,
            html`${others.map((x) => movementCard(ui, x, false))}`,
          )
        : nothing}
      <p class="cq-muted small">
        Join a cause at a tavern or council fire where its people are. A cause
        grows with members, meetings, pamphlets and arms; at ${RISE_SUPPORT}
        support and ${RISE_MEMBERS} sworn members its leader may call a rising,
        and then it's war.
      </p>`,
  );
}

export function movementCard(
  ui: GameUi,
  m: Movement,
  mine: boolean,
): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const me = ui.me;
  const leader = s.chars[m.leader];
  const leads = me && m.leader === me.id;
  const rise = life && leads ? riseCheck(s, life, m) : null;
  return html`<article class="cq-cause ${m.status}">
    <h4 class="cq-cause-name">
      ${m.name}
      <span class="cq-chip ${m.status === "risen" ? "bad" : ""}"
        >${m.status === "risen" ? "in arms" : "brewing"}</span
      >
    </h4>
    <p class="small">
      <b>${GOAL_NAMES[m.goal]}</b> against ${nationLink(ui, m.against)}. Led by
      ${charLink(ui, leader)}; ${m.members.length} sworn besides.
    </p>
    <div class="cq-meter">
      <span class="cq-meter-label">Support</span>${bar(m.support / 100)}<span
        class="cq-meter-n"
        >${Math.round(m.support)}</span
      >
    </div>
    ${m.arms > 0
      ? html`<p class="cq-muted small">Arms put by: ${Math.round(m.arms)}.</p>`
      : nothing}
    <p class="cq-muted small">${m.text} ${GOAL_TEXT[m.goal]}</p>
    ${mine && life
      ? html`<div class="cq-btnrow">
            ${leads && m.status === "brewing"
              ? action(
                  "Call the rising",
                  rise!,
                  () => {
                    if (
                      confirm(
                        `Rise in arms against ${nationName(s.nations[m.against].name)}? There's no going back.`,
                      )
                    )
                      void ui.cmd({ k: "movement", act: "rise" });
                  },
                  "small danger",
                )
              : nothing}
            ${!leads
              ? html`<button
                  class="cq-btn small"
                  @click=${() => void ui.cmd({ k: "movement", act: "lead" })}
                >
                  Take the lead
                </button>`
              : nothing}
            ${m.status === "brewing"
              ? html`<button
                  class="cq-btn small quiet"
                  @click=${() => void ui.cmd({ k: "movement", act: "leave" })}
                >
                  Leave the cause
                </button>`
              : nothing}
          </div>
          ${m.status === "brewing"
            ? html`<p class="cq-muted small">
                To grow it: hold meetings at a tavern or council fire, print
                pamphlets at a press, put arms by at a market, and recruit
                people (from their page).
              </p>`
            : html`<p class="cq-muted small">
                The rising's host is in the
                field${m.rebels >= 0
                  ? html`: ${nationLink(ui, m.rebels)}`
                  : nothing}.
                Win, or hang.
              </p>`}`
      : nothing}
  </article>`;
}

let foundGoal: MovementGoal = "reform";
let foundName = "";

function foundBlock(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const check = foundCheck(s, life);
  const native = lifeIsNative(s, life);
  const target = foundTarget(s, life);
  const goals: MovementGoal[] = native
    ? ["expel"]
    : ["reform", "overthrow", "independence"];
  if (!goals.includes(foundGoal)) foundGoal = goals[0];
  return html`<div class="cq-found">
    <p>You belong to no cause.</p>
    ${more(
      "Found a movement of your own",
      html`<p class="cq-muted small">
          ${target >= 0
            ? html`It would stand against ${nationLink(ui, target)}, among the
              people around ${provLink(ui, life.prov)}.`
            : "Found it where your grievance is: in a colony, among its people."}
        </p>
        <div class="cq-seg" role="radiogroup" aria-label="Its aim">
          ${goals.map(
            (g) =>
              html`<button
                role="radio"
                aria-checked=${foundGoal === g}
                @click=${() => {
                  foundGoal = g;
                  ui.redraw();
                }}
              >
                ${GOAL_NAMES[g]}
              </button>`,
          )}
        </div>
        <p class="cq-muted small">${GOAL_TEXT[foundGoal]}</p>
        <label class="cq-field">
          <span>Its name (or leave it to the printers)</span>
          <input
            class="cq-input"
            maxlength="48"
            .value=${foundName}
            placeholder=${native
              ? "The Alliance of the River"
              : "The Sons of Liberty"}
            @input=${(e: Event) =>
              (foundName = (e.target as HTMLInputElement).value)}
          />
        </label>
        <div class="cq-btnrow">
          ${action(
            "Found it",
            check,
            () =>
              void ui.cmd({
                k: "movement",
                act: "found",
                goal: foundGoal,
                name: foundName || undefined,
              }),
            "small primary",
          )}
        </div>`,
    )}
  </div>`;
}

// ---------------------------------------------------------------- Europe

let takeHeir = false;

function europeSection(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  const native = lifeIsNative(s, life);
  if (native && !life.invite) return nothing;
  const heir = heirOf(s, life);
  const port = (s.provinces[life.prov].b.port ?? 0) > 0;
  const invite = life.invite;
  const rich = life.purse >= EUROPE_FORTUNE;
  const check = invite
    ? life.travel
      ? { ok: false as const, why: "Finish your journey first" }
      : { ok: true as const }
    : !rich
      ? {
          ok: false as const,
          why: `You need ${EUROPE_FORTUNE} coins to live there`,
        }
      : !port
        ? { ok: false as const, why: "Ships sail from a port" }
        : life.travel
          ? { ok: false as const, why: "Finish your journey first" }
          : { ok: true as const };
  const WHY: Record<string, string> = {
    parliament: "Friends at home have found you a seat in Parliament.",
    army: "The army in Flanders offers you a regiment.",
    recalled:
      "The crown has recalled you to explain the colony. A recall isn't a request.",
    exile: "You must leave the Americas.",
  };
  const heirC = s.chars[heir];
  return section(
    "Europe",
    html`${invite
        ? html`<div class="cq-callout lit">
            <p>
              <b>${WHY[invite.why] ?? "You're invited home."}</b> Answer by
              ${formatDate(invite.until)}.
            </p>
          </div>`
        : html`<p class="small">
            With a fortune (${EUROPE_FORTUNE} coins) you could go home to Europe
            and live as a person of means. You have ${Math.floor(life.purse)}.
          </p>`}
      <p class="cq-muted small">
        Going to Europe ends your story in the Americas.
        ${heirC?.alive
          ? html`Leave ${charLink(ui, heirC)} behind and you carry on as them
            (with half the purse); take the family and your story ends there.`
          : "With no heir left behind, your story ends there and you watch the world."}
      </p>
      ${heirC?.alive
        ? html`<label class="cq-check small">
            <input
              type="checkbox"
              .checked=${takeHeir}
              @change=${(e: Event) => {
                takeHeir = (e.target as HTMLInputElement).checked;
                ui.redraw();
              }}
            />
            Take the whole family (the story ends)
          </label>`
        : nothing}
      <div class="cq-btnrow">
        ${action(
          "Sail for Europe",
          check,
          () => {
            if (
              confirm(
                heirC?.alive && !takeHeir
                  ? `Sail for Europe? You'll carry on as ${heirC.first}.`
                  : "Sail for Europe? Your story in the Americas ends.",
              )
            )
              void ui.cmd({ k: "europe", takeHeir: takeHeir || !heirC?.alive });
          },
          "small primary",
        )}
        ${invite && invite.why !== "recalled"
          ? html`<button
              class="cq-btn small quiet"
              @click=${() => void ui.cmd({ k: "decline" })}
            >
              Decline
            </button>`
          : nothing}
      </div>`,
  );
}
