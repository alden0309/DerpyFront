// Things that stop the game to be read: letters asking for a decision,
// battle reports, peace negotiations, the menu, the rules and the results.

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import {
  leaderFlags,
  missionCheck,
  missionDays,
  missionLeaders,
} from "../../engine/Missions";
import {
  peaceCheck,
  peaceWillingness,
  provinceValue,
  warBetween,
  warScore,
} from "../../engine/Queries";
import {
  EXPEDITION,
  OUTPOST,
  REG_NAMES,
  SEAT_NAMES,
  STAT_NAMES,
} from "../../engine/Rules";
import type { BattleSide, PeaceTerms, RegType } from "../../engine/Types";
import { SEATS } from "../../engine/Types";
import type { ResultLine } from "../../Protocol";
import { creditsList } from "../Credits";
import { flagFor } from "../Flags";
import { confirmMarch, setConfirmMarch } from "../Prefs";
import "../Range";
import { music, play, setSoundSettings, soundSettings } from "../Sound";
import { money, nationName } from "../Text";
import { num } from "../Tip";
import { battleVerdict, reasonList, strengthBars } from "./Battle";
import { action, breakdownTip, GameUi, Modal, token } from "./Context";
import "./Goods";
import "./Story";

/** What the menu and the results need from the game screen. */
export interface ModalHooks {
  save(): void;
  leave(): void;
  endGame(): void;
  isHost: boolean;
  signedIn: boolean;
  savedAt: string | null;
  code: string;
  results: ResultLine[] | null;
  /** Seconds of play a letter has before the council decides, if known. */
  letterLeft(id: number): number | null;
  paused: boolean;
}

export function renderModal(
  ui: GameUi,
  m: Modal,
  hooks: ModalHooks,
): TemplateResult {
  let body: TemplateResult;
  let cls = "";
  switch (m.k) {
    case "event":
      body = eventLetter(ui, m.id, hooks);
      cls = "letter";
      break;
    case "battle":
      body = battleReport(ui, m.id);
      cls = "wide";
      break;
    case "peace":
      body = peaceTable(ui, m.n, m.terms ?? { take: [], give: [], gold: 0 });
      break;
    case "menu":
      body = menu(ui, hooks);
      break;
    case "help":
      body = helpPage();
      cls = "wide";
      break;
    case "end":
      body = endPage(ui, hooks);
      cls = "wide end";
      break;
    case "mission":
      body = missionPicker(ui, m.p, m.kind, m.leader);
      cls = "wide";
      break;
    case "trade":
      body = html`<cq-deal .ui=${ui} .other=${m.n}></cq-deal>`;
      cls = "wide";
      break;
    case "credits":
      body = creditsPage(ui);
      cls = "wide";
      break;
  }
  const closable = !(m.k === "end" && ui.s.over);
  return html`<div
    class="cq-scrim"
    @click=${(e: Event) =>
      e.target === e.currentTarget && closable && ui.modal(null)}
  >
    <div class="cq-modal ${cls}" role="dialog" aria-modal="true">
      ${closable
        ? html`<button
            class="cq-modal-x"
            aria-label="Close"
            @click=${() => ui.modal(null)}
          >
            ×
          </button>`
        : nothing}
      ${body}
    </div>
  </div>`;
}

// ---------------------------------------------------------------- letters

/** "The council decides in 1:12 of play" (or "paused"). */
export function letterClock(hooks: ModalHooks, id: number): TemplateResult {
  const left = hooks.letterLeft(id);
  if (left === null)
    return html`If you don't answer, your council takes the first course.`;
  const m = Math.floor(left / 60);
  const sec = String(Math.floor(left % 60)).padStart(2, "0");
  return html`Your council takes the first course in
    <b class="cq-countdown ${left < 20 ? "bad" : ""}">${m}:${sec}</b> of
    play${hooks.paused
      ? html` <span class="cq-chip">clock paused</span>`
      : nothing}.`;
}

function eventLetter(
  ui: GameUi,
  id: number,
  hooks: ModalHooks,
): TemplateResult {
  const n = ui.s.nations[ui.me];
  const ev = n?.events.find((e) => e.id === id);
  if (!ev) {
    return html`<p class="cq-muted">That matter has been settled.</p>
      <div class="cq-btnrow">
        <button class="cq-btn" @click=${() => ui.modal(null)}>Close</button>
      </div>`;
  }
  const others = n.events.filter((e) => e.id !== id).length;
  return html`
    <div class="cq-seal" aria-hidden="true"></div>
    <p class="cq-letter-date">${formatDate(ev.day)}</p>
    <h2 class="cq-letter-title">${ev.title}</h2>
    <div class="cq-letter-body">
      ${ev.body.split("\n").map((para) => html`<p>${para}</p>`)}
    </div>
    <ol class="cq-choices">
      ${ev.choices.map(
        (c, i) =>
          html`<li>
            <button
              class="cq-choice"
              @click=${async () => {
                if (await ui.cmd({ k: "event", id, choice: i })) {
                  play("seal");
                  const next = ui.s.nations[ui.me].events.find(
                    (e) => e.id !== id,
                  );
                  ui.modal(next ? { k: "event", id: next.id } : null);
                }
              }}
            >
              <span class="cq-choice-label">${c.label}</span>
              <span class="cq-choice-tip">${c.tip}</span>
            </button>
          </li>`,
      )}
    </ol>
    <p class="cq-muted small cq-letter-foot">
      ${letterClock(hooks, id)}
      ${others > 0
        ? html`${others} more letter${others === 1 ? "" : "s"} waiting.`
        : nothing}
    </p>
    <div class="cq-btnrow end">
      <button class="cq-btn quiet" @click=${() => ui.modal(null)}>
        Decide later
      </button>
    </div>
  `;
}

// ---------------------------------------------------------------- battles

function whyItWent(ui: GameUi, id: number): TemplateResult {
  const r = ui.s.battles.find((b) => b.id === id);
  if (!r) return html``;
  const v = battleVerdict(ui.s, r, ui.me);
  const labels: [string, string] =
    v.ours >= 0
      ? ["You", "Them"]
      : [
          nationName(ui.s.nations[r.attacker.nations[0]].name),
          nationName(ui.s.nations[r.defender.nations[0]].name),
        ];
  return html`<section class="cq-why-box">
    <h3 class="cq-h3">Why it went this way</h3>
    ${strengthBars(v, labels)} ${reasonList(v)}
  </section>`;
}

function battleReport(ui: GameUi, id: number): TemplateResult {
  const r = ui.s.battles.find((b) => b.id === id);
  if (!r) return html`<p class="cq-muted">That report has been filed away.</p>`;
  const place = ui.map.provinces[r.prov].name;
  const ours = r.attacker.nations.includes(ui.me)
    ? 0
    : r.defender.nations.includes(ui.me)
      ? 1
      : -1;
  const headline =
    ours < 0
      ? `${r.winner === 0 ? "The attackers" : "The defenders"} carried the day.`
      : r.winner === ours
        ? "A victory."
        : "A defeat.";
  return html`
    <p class="cq-letter-date">${formatDate(r.day)}</p>
    <h2 class="cq-h1">The battle of ${place}</h2>
    <p class="cq-lede ${ours >= 0 ? (r.winner === ours ? "good" : "bad") : ""}">
      ${headline}
      ${r.outcome === "destroyed"
        ? "The losing army was destroyed."
        : "The losers fell back."}
    </p>
    ${whyItWent(ui, r.id)}
    <div class="cq-battle-sides">
      ${side(ui, r.attacker, "Attacking", r.winner === 0)}
      ${side(ui, r.defender, "Defending", r.winner === 1)}
    </div>
    <h3 class="cq-h3">Day by day</h3>
    <table class="cq-table compact">
      <thead>
        <tr>
          <th>Day</th>
          <th class="r">Attackers lost</th>
          <th class="r">Defenders lost</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${r.rounds.map(
          (round, i) =>
            html`<tr>
              <td>${i + 1}</td>
              <td class="r">${round.lost[0]}</td>
              <td class="r">${round.lost[1]}</td>
              <td class="small">${round.note ?? ""}</td>
            </tr>`,
        )}
      </tbody>
    </table>
    <h3 class="cq-h3">Fortune</h3>
    <ul class="cq-list">
      ${r.luck.map((l) => html`<li>${l}</li>`)}
    </ul>
    <p class="cq-muted small">
      Nothing here is a dice roll without a name: strength is men × training ×
      morale × each factor above, and the only luck is the weather and the
      commanders' moments listed under Fortune.
    </p>
  `;
}

function side(
  ui: GameUi,
  s: BattleSide,
  label: string,
  won: boolean,
): TemplateResult {
  const strength = s.factors.reduce((m, f) => m * f.value, 1);
  return html`<div class="cq-battle-side ${won ? "won" : "lost"}">
    <h3 class="cq-h3">
      ${label} ${won ? html`<span class="cq-chip good">Won</span>` : nothing}
    </h3>
    <p class="cq-flags">
      ${s.nations.map(
        (n) =>
          html`<span class="cq-nation-tag"
            >${flagFor(ui.s.nations[n], "cq-flag sm")}${nationName(
              ui.s.nations[n].name,
            )}</span
          >`,
      )}
    </p>
    <p class="small">
      ${s.commander
        ? `Led by ${s.commander}`
        : html`<span class="cq-muted">No commander</span>`}
    </p>
    <p class="small">
      ${(Object.entries(s.regs) as [RegType, number][])
        .filter(([, v]) => v > 0)
        .map(([t, v]) => `${v} ${REG_NAMES[t].toLowerCase()}`)
        .join(", ")}
    </p>
    <dl class="cq-dl">
      <dt>Men</dt>
      <dd>${Math.round(s.men)}</dd>
      <dt>Lost</dt>
      <dd>${Math.round(s.lost)}</dd>
      <dt>Morale at the end</dt>
      <dd>${Math.round(s.moraleEnd * 100)}%</dd>
    </dl>
    <table class="cq-table compact factors">
      <tbody>
        ${s.factors.map(
          (f) =>
            html`<tr>
              <td>${f.label}</td>
              <td class="r ${f.value >= 1 ? "good" : "bad"}">
                ×${f.value.toFixed(2)}
              </td>
            </tr>`,
        )}
        <tr class="total">
          <td>All together</td>
          <td class="r">×${strength.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
  </div>`;
}

// ---------------------------------------------------------------- peace

function peaceTable(ui: GameUi, n: number, terms: PeaceTerms): TemplateResult {
  const s = ui.s;
  const me = ui.me;
  const war = warBetween(s, me, n);
  const them = s.nations[n];
  if (!war) {
    return html`<h2 class="cq-h1">Peace with ${nationName(them.name)}</h2>
      <p class="cq-muted">You're not at war with them.</p>`;
  }
  const theirsHeld: number[] = [];
  const oursHeld: number[] = [];
  s.provinces.forEach((pr, p) => {
    if (pr.owner === n && pr.occupier === me) theirsHeld.push(p);
    if (pr.owner === me && pr.occupier === n) oursHeld.push(p);
  });
  const set = (t: Partial<PeaceTerms>) =>
    ui.modal({ k: "peace", n, terms: { ...terms, ...t } });
  const toggle = (list: number[], p: number) =>
    list.includes(p) ? list.filter((x) => x !== p) : [...list, p];
  const willing = peaceWillingness(s, me, n, terms);
  const check = peaceCheck(s, me, n, terms);
  const human = them.player !== null;
  const score = warScore(s, war, me);
  const maxTake = Math.floor(them.gold);
  const maxGive = Math.floor(s.nations[me].gold);
  return html`
    <h2 class="cq-h1 with-flag">
      ${flagFor(them, "cq-flag lg")} Terms for ${nationName(them.name)}
    </h2>
    <p>
      The war so far:
      ${num(
        `${score.total > 0 ? "+" : ""}${score.total}`,
        () => breakdownTip("How the war is going for you", score),
        score.total >= 0 ? "good" : "bad",
      )}.
      ${war.why}, since ${formatDate(war.start)}.
    </p>
    <div class="cq-peace-cols">
      <fieldset class="cq-fieldset">
        <legend>They give you</legend>
        ${theirsHeld.length === 0
          ? html`<p class="cq-muted small">
              You hold none of their land. Occupy provinces to demand them.
            </p>`
          : theirsHeld.map(
              (p) =>
                html`<label class="cq-check">
                  <input
                    type="checkbox"
                    .checked=${terms.take.includes(p)}
                    @change=${() => set({ take: toggle(terms.take, p) })}
                  />
                  ${ui.map.provinces[p].name}
                  <span class="cq-muted small"
                    >worth ${provinceValue(s, p)}</span
                  >
                </label>`,
            )}
      </fieldset>
      <fieldset class="cq-fieldset">
        <legend>You give back</legend>
        ${oursHeld.length === 0
          ? html`<p class="cq-muted small">They hold none of your land.</p>`
          : oursHeld.map(
              (p) =>
                html`<label class="cq-check">
                  <input
                    type="checkbox"
                    .checked=${terms.give.includes(p)}
                    @change=${() => set({ give: toggle(terms.give, p) })}
                  />
                  ${ui.map.provinces[p].name}
                  <span class="cq-muted small">they keep it</span>
                </label>`,
            )}
        <p class="cq-muted small">
          Land you don't give up returns to you when the peace is signed.
        </p>
      </fieldset>
    </div>
    ${them.kind === "native" && s.nations[me].kind === "power"
      ? html`<label class="cq-check cq-subjugate">
          <input
            type="checkbox"
            .checked=${!!terms.subjugate}
            @change=${(e: Event) =>
              set({ subjugate: (e.target as HTMLInputElement).checked })}
          />
          <span
            ><b>Make them a tributary.</b> They keep their land and chiefs but
            pay you a fifth of their gold and a share of their furs each month,
            fight beside you, and can't make war on you. They'll resent
            it.</span
          >
        </label>`
      : nothing}
    <cq-range
      label="Gold"
      .min=${-maxGive}
      .max=${maxTake}
      .step=${5}
      .value=${terms.gold}
      .format=${(g: number) =>
        g > 0
          ? `They pay ${money(g)}`
          : g < 0
            ? `You pay ${money(-g)}`
            : "No gold"}
      @cq-input=${(e: CustomEvent<number>) => set({ gold: e.detail })}
    ></cq-range>
    <div class="cq-verdict ${willing.total >= 0 ? "good" : "bad"}">
      ${human
        ? html`${nationName(them.name)} is played by ${them.playerName}; they'll
          decide. Their council's view:
          ${num(String(willing.total), () =>
            breakdownTip("Would they accept? (yes at 0 or more)", willing),
          )}`
        : html`${num(
            willing.total >= 0 ? "They'd accept" : "They'd refuse",
            () =>
              breakdownTip("Would they accept? (yes at 0 or more)", willing),
          )}`}
    </div>
    <div class="cq-btnrow end">
      <button
        class="cq-btn quiet"
        @click=${() => set({ take: [], give: [], gold: 0, subjugate: false })}
      >
        White peace
      </button>
      ${action(
        human ? "Send the offer" : "Offer peace",
        check,
        async () => {
          if (await ui.cmd({ k: "peace", n, terms })) {
            ui.modal(null);
            if (human) ui.toast(`Offer sent to ${them.playerName}.`);
          }
        },
        "primary",
      )}
    </div>
  `;
}

// ---------------------------------------------------------------- menu, help, end

function menu(ui: GameUi, hooks: ModalHooks): TemplateResult {
  return html`
    <h2 class="cq-h1">The game</h2>
    ${!ui.solo
      ? html`<p>
          Friends can join with the code
          <b class="cq-code">${hooks.code}</b> (they'll watch until the next
          game).
        </p>`
      : nothing}
    <div class="cq-menu">
      <button
        class="cq-btn"
        ?disabled=${!hooks.signedIn}
        @click=${() => hooks.save()}
      >
        Save now
      </button>
      <p class="cq-muted small">
        ${hooks.signedIn
          ? hooks.savedAt
            ? `Last saved ${new Date(hooks.savedAt).toLocaleTimeString()}. It also saves every few minutes and whenever you pause.`
            : "The game saves every few minutes and whenever you pause."
          : "Sign in to Derp Land to save games and come back to them."}
      </p>
      <button class="cq-btn" @click=${() => ui.modal({ k: "help" })}>
        How to play
      </button>
      ${settingsBlock(ui)}
      ${hooks.isHost && !ui.s.over
        ? html`<button
            class="cq-btn danger"
            @click=${() => {
              if (
                confirm("End the game now? Scores are counted as they stand.")
              )
                hooks.endGame();
            }}
          >
            End the game and count scores
          </button>`
        : nothing}
      <button class="cq-btn" @click=${() => hooks.leave()}>
        Leave to the lobby
      </button>
      <p class="cq-muted small">
        ${ui.solo
          ? "Leaving saves your game; pick it up later from the lobby."
          : "Leaving keeps your nation; the game goes on without you, and you can come back."}
      </p>
    </div>
  `;
}

function settingsBlock(ui: GameUi): TemplateResult {
  const snd = soundSettings();
  const change = (next: Parameters<typeof setSoundSettings>[0]) => {
    setSoundSettings(next);
    ui.redraw();
  };
  return html`<fieldset class="cq-prefs">
    <legend>Settings</legend>
    <label class="cq-check">
      <input
        type="checkbox"
        .checked=${snd.music}
        @change=${(e: Event) =>
          change({ music: (e.target as HTMLInputElement).checked })}
      />
      Music
      ${snd.music && music.title
        ? html`<span class="cq-muted small">playing ${music.title}</span>`
        : nothing}
    </label>
    <cq-range
      label="Music volume"
      .min=${0}
      .max=${100}
      .step=${5}
      .value=${Math.round(snd.musicVolume * 100)}
      .disabled=${!snd.music}
      .format=${(v: number) => `${v}%`}
      @cq-input=${(e: CustomEvent<number>) =>
        setSoundSettings({ musicVolume: e.detail / 100 })}
    ></cq-range>
    <label class="cq-check">
      <input
        type="checkbox"
        .checked=${snd.sfx}
        @change=${(e: Event) => {
          change({ sfx: (e.target as HTMLInputElement).checked });
          play("bell");
        }}
      />
      Sounds (quill, bells, drums and cannon)
    </label>
    <cq-range
      label="Sound volume"
      .min=${0}
      .max=${100}
      .step=${5}
      .value=${Math.round(snd.sfxVolume * 100)}
      .disabled=${!snd.sfx}
      .format=${(v: number) => `${v}%`}
      @cq-input=${(e: CustomEvent<number>) =>
        setSoundSettings({ sfxVolume: e.detail / 100 })}
      @cq-change=${() => play("seal")}
    ></cq-range>
    <label class="cq-check">
      <input
        type="checkbox"
        .checked=${confirmMarch()}
        @change=${(e: Event) => {
          setConfirmMarch((e.target as HTMLInputElement).checked);
          ui.redraw();
        }}
      />
      Ask before marching when I right-click a province
    </label>
    <button class="cq-link small" @click=${() => ui.modal({ k: "credits" })}>
      Credits for the art, sounds and music
    </button>
  </fieldset>`;
}

function creditsPage(ui: GameUi): TemplateResult {
  return html`
    <h2 class="cq-h1">Credits</h2>
    <p class="cq-lede small">
      The portraits are paintings and prints of the 1600s and 1700s, now in the
      public domain. The other pictures, sounds and music were shared freely by
      the people who made them. With thanks to:
    </p>
    ${creditsList()}
    <p class="cq-muted small">
      Derpy Conquest is part of Derp Land, built on OpenFront.
      <a href="https://github.com/alden0309/DerpyFront" target="_blank"
        >Source</a
      >.
    </p>
    <div class="cq-btnrow end">
      <button class="cq-btn" @click=${() => ui.modal({ k: "menu" })}>
        Back to the menu
      </button>
    </div>
  `;
}

const HELP: [string, string][] = [
  [
    "Who you are",
    "You are a colonial governor, not a nation. Your crown granted the charter; it wants revenue, obedience and results. You have a council, a family and rivals, and you will grow old. When you die your heir governs; with no heir, the crown appoints someone from your council.",
  ],
  [
    "Time",
    "The game runs day by day. Pause with the space bar, set the speed with 1 to 5. In a solo game, letters that need an answer pause it for you.",
  ],
  [
    "Every number explains itself",
    "Point at (or tap) any number and a slip lists what made it. Nothing happens by chance without a named cause.",
  ],
  [
    "People and their needs",
    "Each province holds groups of people: laborers, artisans, merchants, gentry, clergy and native tribes, each with a faith and a culture. They need food, then cloth and tools, then luxuries. Unmet needs, high taxes, other faiths and too much land breed unrest; at 100 a province revolts.",
  ],
  [
    "Timber, tools and laborers",
    "Almost everything you build needs timber and tools, and every new regiment needs laborers. Timber: every settlement cuts some clearing land (more in forest), and a lumber camp in timber country adds more. Tools: a smithy turns timber into tools; until you have one, buy them in Europe from the Treasury tab or trade for them. Laborers: they arrive with settlers from home every month and grow when there's food, so keep grain in store. The Treasury tab's goods table shows what you make and use of each, and clicking a good tells you where to get more.",
  ],
  [
    "Trade",
    "Goods have a price in your colony set by supply and demand, and a price in Europe. A convoy sails from your main port every two months, carrying whatever sells for more at home, and returns weeks later with what's dear here. Ice and storms slow it. To get a particular good quickly, buy it outright in Europe from the Treasury tab: you pay now and a ship brings it. To swap goods with another colony or a native nation you border, open their page and choose Trade goods.",
  ],
  [
    "Administration",
    "Every province costs administration, more when it's far from your capital or full of foreigners. Your charter, your stewardship, your treasurer and courthouses decide how much you can govern. Go over and unrest, corruption and breakaways follow.",
  ],
  [
    "The crown",
    "Favor rises with money sent home and obedience, and falls when you ignore demands or start wars on your own. High favor brings honours and settlers; low favor brings inspectors and recall. Autonomy grows as you keep money at home and grow rich. At 60 you may declare independence.",
  ],
  [
    "War",
    "Regiments are drafted from your people, who stop working. Armies eat; away from home they live off the land, and winter and fever thin them. Battles weigh men, training, morale, supplies, terrain, rivers, forts, commanders and the weather. Taking a province is occupying it; it's yours only when a peace says so.",
  ],
  [
    "Native nations",
    "The Powhatan, Haudenosaunee, Wendat, Muscogee and many more are full nations with their own chiefs, councils, trade and wars. They remember gifts, broken treaties and land taken. Buy land from friends; take it from enemies at your peril. A native nation much weaker than you can be made a tributary, by demanding it or as a term of peace: it keeps its land but pays you tribute, fights beside you and can't attack you. Release it whenever you like.",
  ],
  [
    "Giving up a settlement",
    "A colony that costs more than it's worth can be abandoned from its province page. Most of its people move to your nearest settlement, the land goes back to the wild, the natives around it are glad, and the crown is not.",
  ],
  [
    "Start dates",
    "Start in 1607 with a handful of ships, in 1650 when New England, New Netherland and New France are taking root, or in 1700 on the eve of the War of the Spanish Succession, with the colonies as they were then.",
  ],
  [
    "Winning",
    "The game ends in the year you chose. Score comes from land, people, wealth, honours and independence. Loyal servant, merchant prince or rebel: all three roads can win.",
  ],
];

function helpPage(): TemplateResult {
  return html`
    <h2 class="cq-h1">How Derpy Conquest works</h2>
    <dl class="cq-help">
      ${HELP.map(
        ([t, d]) =>
          html`<dt>${t}</dt>
            <dd>${d}</dd>`,
      )}
    </dl>
    <p class="cq-muted small">
      Keys: space pauses, 1–5 set the speed, + and − zoom, Esc closes things. To
      march, select an army and right-click a province, or press March to… on
      the army's page and tap where to go.
    </p>
  `;
}

function endPage(ui: GameUi, hooks: ModalHooks): TemplateResult {
  const s = ui.s;
  const results = hooks.results;
  const ranked = s.nations
    .filter((n) => n.kind === "power")
    .map((n) => ({ n, score: n.score }))
    .sort((a, b) => b.score - a.score);
  const winner = s.winner >= 0 ? s.nations[s.winner] : ranked[0]?.n;
  const yours =
    ui.me >= 0 && s.nations[ui.me].kind === "power" ? ui.me : winner?.id;
  return html`
    <h2 class="cq-h1">${s.over ? "The game is over" : "The standings"}</h2>
    ${winner
      ? html`<p class="cq-lede">
          ${flagFor(winner, "cq-flag lg")} ${nationName(winner.name)}
          ${s.over ? "wins" : "leads"}.
        </p>`
      : nothing}
    ${yours !== undefined
      ? html`<cq-colony-story .ui=${ui} .nation=${yours}></cq-colony-story>`
      : nothing}
    <h3 class="cq-h3">Standings</h3>
    ${results
      ? html`<table class="cq-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Nation</th>
              <th class="r">Score</th>
              <th class="r">Derp Coins</th>
            </tr>
          </thead>
          <tbody>
            ${results.map(
              (r) =>
                html`<tr class=${r.won ? "won" : ""}>
                  <td>${r.rank}</td>
                  <td>${r.name}</td>
                  <td>
                    ${nationName(
                      s.nations.find((n) => n.key === r.power)?.name ?? r.power,
                    )}
                  </td>
                  <td class="r">${r.score}</td>
                  <td class="r">
                    ${r.coins === null
                      ? html`<span class="cq-muted small"
                          >sign in to earn</span
                        >`
                      : `+${r.coins}`}
                  </td>
                </tr>`,
            )}
          </tbody>
        </table>`
      : html`<table class="cq-table">
          <thead>
            <tr>
              <th>Nation</th>
              <th>Played by</th>
              <th class="r">Score</th>
            </tr>
          </thead>
          <tbody>
            ${ranked.map(
              ({ n, score }) =>
                html`<tr>
                  <td>${flagFor(n, "cq-flag sm")} ${nationName(n.name)}</td>
                  <td>
                    ${n.playerName ??
                    html`<span class="cq-muted">computer</span>`}
                  </td>
                  <td class="r">${score}</td>
                </tr>`,
            )}
          </tbody>
        </table>`}
    <div class="cq-btnrow end">
      ${s.over
        ? nothing
        : html`<button class="cq-btn quiet" @click=${() => ui.modal(null)}>
            Back to the map
          </button>`}
      <button class="cq-btn primary" @click=${() => hooks.leave()}>
        Back to the lobby
      </button>
    </div>
  `;
}

// ---------------------------------------------------------------- expeditions and outposts

function missionPicker(
  ui: GameUi,
  p: number,
  kind: "explore" | "outpost",
  chosen?: number,
): TemplateResult {
  const s = ui.s;
  const place = ui.map.provinces[p].name;
  const leaders = missionLeaders(s, ui.me);
  const pick = chosen ?? leaders[0]?.id;
  const leader = pick !== undefined ? s.chars[pick] : undefined;
  const days = missionDays(s, ui.w, ui.me, leader, p, kind);
  const check =
    pick !== undefined
      ? missionCheck(s, ui.w, ui.me, pick, p, kind)
      : { ok: false as const, why: "Nobody at court is free to go." };
  const n = s.nations[ui.me];
  const seatOf = (id: number) => SEATS.find((seat) => n.council[seat] === id);
  return html`
    <h2 class="cq-h1">
      ${kind === "explore"
        ? `An expedition to ${place}`
        : `An outpost at ${place}`}
    </h2>
    <p class="cq-lede small">
      ${kind === "explore"
        ? `A small party surveys ${place} and the country around it: what the land yields, and whether any of it is rich. ${EXPEDITION.gold} gold.`
        : `A party raises a palisade at ${place}: defenders there fight ${Math.round(OUTPOST.defense * 100)}% harder, the land feeds ${OUTPOST.supply * 1000} more of your men, and a colony there is founded faster. ${OUTPOST.gold} gold, timber and tools, then ${OUTPOST.upkeep} gold a month.`}
      The journey is dangerous, and who leads it matters.
    </p>
    <h3 class="cq-h3">Who leads it</h3>
    ${leaders.length === 0
      ? html`<p class="cq-empty">
          Nobody at court is free: everyone is governing, leading an army or
          already away.
        </p>`
      : html`<ul class="cq-leaders">
          ${leaders.map((c) => {
            const flags = leaderFlags(s, c);
            const seat = seatOf(c.id);
            return html`<li>
              <button
                class="cq-leader ${c.id === pick ? "on" : ""}"
                aria-pressed=${c.id === pick}
                title=${flags
                  .map((f) => `${f.good ? "+" : "−"} ${f.text}`)
                  .join("\n") || "Nothing special for the trail"}
                @click=${() =>
                  ui.modal({ k: "mission", p, kind, leader: c.id })}
              >
                ${token(ui, c)}
                <span class="cq-leader-text">
                  <b>${c.title ?? `${c.first} ${c.family}`}</b>
                  <span class="cq-muted small"
                    >${seat ? SEAT_NAMES[seat] : "At court"}, ${STAT_NAMES.mar}
                    ${c.stats.mar}, ${STAT_NAMES.lea} ${c.stats.lea},
                    ${STAT_NAMES.dip} ${c.stats.dip}</span
                  >
                  <span class="cq-flags-list">
                    ${flags.length === 0
                      ? html`<span class="cq-muted small"
                          >Nothing that helps or hurts on the trail.</span
                        >`
                      : flags.map(
                          (f) =>
                            html`<span
                              class="cq-flag-chip ${f.good ? "good" : "bad"}"
                              >${f.good ? "+" : "−"}
                              ${f.text.split(":")[0]}</span
                            >`,
                        )}
                  </span>
                </span>
              </button>
            </li>`;
          })}
        </ul>`}
    ${leader
      ? html`<div class="cq-mission-sum">
          <p>
            ${leader.first} would reach ${place} in
            ${num(`${days.total} days`, () =>
              breakdownTip("Days to get there (the same again back)", days),
            )}
            and be home about ${days.total * 2} days from now. Halfway out, the
            country decides what goes wrong: rapids where rivers cross, fever in
            hot lowlands, warriors where natives live, getting lost in forest
            and mountains, snow in winter.
          </p>
          <ul class="cq-trail-notes">
            ${leaderFlags(s, leader).map(
              (f) => html`<li class=${f.good ? "good" : "bad"}>${f.text}</li>`,
            )}
          </ul>
        </div>`
      : nothing}
    <div class="cq-btnrow end">
      <button class="cq-btn quiet" @click=${() => ui.modal(null)}>
        Not now
      </button>
      ${action(
        kind === "explore" ? "Send them" : "Send the party",
        check,
        async () => {
          if (pick === undefined) return;
          if (
            await ui.cmd({
              k: kind === "explore" ? "expedition" : "outpost",
              c: pick,
              p,
            })
          ) {
            ui.modal(null);
            ui.toast(
              `${leader?.first ?? "The party"} sets out for ${place}.`,
              "good",
            );
          }
        },
        "primary",
      )}
    </div>
  `;
}
