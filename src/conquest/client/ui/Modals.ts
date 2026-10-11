// Things that stop the game to be read: what happens to you and needs an
// answer, battle reports, the market, making a new character or taking over
// someone, the menu, the rules and the end of the story.

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import {
  carried,
  CARRY,
  lifeTitle,
  marketPrice,
  takeoverCandidates,
  tradeRates,
} from "../../engine/LifeQueries";
import { ageOf, charName } from "../../engine/Queries";
import { REG_NAMES } from "../../engine/Rules";
import type { BattleSide, Good, LifePlan, RegType } from "../../engine/Types";
import { GOODS } from "../../engine/Types";
import type { ResultLine } from "../../Protocol";
import { creditsList } from "../Credits";
import { flagFor } from "../Flags";
import "../Maker";
import { confirmMarch, setConfirmMarch } from "../Prefs";
import "../Range";
import { music, play, setSoundSettings, soundSettings } from "../Sound";
import { GOOD_NAMES, nationName } from "../Text";
import {
  battleVerdict,
  myBattleNation,
  reasonList,
  strengthBars,
} from "./Battle";
import { GameUi, Modal, token } from "./Context";
import { roleOf } from "./Here";
import { eventScene, interactScene, outcomeScene } from "./Scene";
import { sittingPage } from "./Sitting";
import "./Story";

/** What the menu and the results need from the game screen. */
export interface ModalHooks {
  save(): void;
  leave(): void;
  endGame(): void;
  /** Sends a new character into the running world. */
  newLife(plan: LifePlan): void;
  isHost: boolean;
  signedIn: boolean;
  savedAt: string | null;
  code: string;
  results: ResultLine[] | null;
  /** Seconds of play an event has before it decides itself, if known. */
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
      body = eventScene(ui, m.id, hooks);
      cls = "scene";
      break;
    case "interact":
      body = interactScene(ui, m);
      cls = "scene";
      break;
    case "outcome":
      body = outcomeScene(ui);
      cls = "scene";
      break;
    case "battle":
      body = battleReport(ui, m.id);
      cls = "wide";
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
    case "credits":
      body = creditsPage(ui);
      cls = "wide";
      break;
    case "maker":
      body = makerPage(ui, hooks);
      cls = "wide maker";
      break;
    // ART (r11): the gallery, to sit for a new likeness.
    case "likeness":
      body = sittingPage(ui);
      cls = "wide maker";
      break;
    case "takeover":
      body = takeoverPage(ui);
      cls = "wide";
      break;
    case "trade":
      body = tradePage(ui);
      break;
  }
  const closable = !(m.k === "end" && ui.s.over);
  return html`<div
    class="cq-scrim"
    @click=${(e: Event) =>
      e.target === e.currentTarget && closable && ui.modal(null)}
  >
    <div class="cq-modal ${cls}" role="dialog" aria-modal="true" data-steady>
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

// ---------------------------------------------------------------- events

/** "Decides itself in 1:12 of play" (or "paused"). */
export function letterClock(
  hooks: ModalHooks,
  id: number,
  fallback = "the first course is taken",
): TemplateResult {
  const left = hooks.letterLeft(id);
  if (left === null) return html`If you don't answer, ${fallback} for you.`;
  const m = Math.floor(left / 60);
  const sec = String(Math.floor(left % 60)).padStart(2, "0");
  return html`If you don't answer, ${fallback} in
    <b class="cq-countdown ${left < 20 ? "bad" : ""}">${m}:${sec}</b> of
    play${hooks.paused
      ? html` <span class="cq-chip">clock paused</span>`
      : nothing}.`;
}

// ---------------------------------------------------------------- battles

function battleReport(ui: GameUi, id: number): TemplateResult {
  const r = ui.s.battles.find((b) => b.id === id);
  if (!r) return html`<p class="cq-muted">That report has been filed away.</p>`;
  const place = ui.map.provinces[r.prov].name;
  const mine = myBattleNation(ui, r);
  const v = battleVerdict(ui.s, r, mine);
  const ours = v.ours;
  const headline =
    ours < 0
      ? `${r.winner === 0 ? "The attackers" : "The defenders"} carried the day.`
      : r.winner === ours
        ? "A victory."
        : "A defeat.";
  const labels: [string, string] =
    ours >= 0
      ? ["Your side", "Theirs"]
      : [
          nationName(ui.s.nations[r.attacker.nations[0]].name),
          nationName(ui.s.nations[r.defender.nations[0]].name),
        ];
  return html`
    <p class="cq-letter-date">${formatDate(r.day)}</p>
    <h2 class="cq-h1">The battle of ${place}</h2>
    <p class="cq-lede ${ours >= 0 ? (r.winner === ours ? "good" : "bad") : ""}">
      ${headline}
      ${r.outcome === "destroyed"
        ? "The losing army was destroyed."
        : "The losers fell back."}
    </p>
    <section class="cq-why-box">
      <h3 class="cq-h3">Why it went this way</h3>
      ${strengthBars(v, labels)} ${reasonList(v)}
    </section>
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

// ---------------------------------------------------------------- the market

function tradePage(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  if (!life || !ui.me) return html`<p class="cq-muted">You're watching.</p>`;
  const load = carried(life);
  const place = ui.map.provinces[life.prov].name;
  const trade = (good: Good, qty: number) => ui.cmd({ k: "trade", good, qty });
  return html`
    <h2 class="cq-h1">The market at ${place}</h2>
    <p class="cq-lede small">
      Buy cheap, carry it (up to ${CARRY} loads), sell dear somewhere else. Furs
      are cheap in the villages and dear on the coast; guns, cloth and tools the
      other way round. You carry ${load} of ${CARRY}; purse
      ${Math.floor(life.purse)}.
    </p>
    <table class="cq-table cq-market">
      <thead>
        <tr>
          <th>Good</th>
          <th class="r">Buy</th>
          <th class="r">Sell</th>
          <th class="r">Yours</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${GOODS.filter((g) => marketPrice(s, life.prov, g) > 0).map((g) => {
          const r = tradeRates(s, life, g);
          const have = life.goods[g] ?? 0;
          return html`<tr>
            <td>${GOOD_NAMES[g]}</td>
            <td class="r">${r.buy.toFixed(1)}</td>
            <td class="r">${r.sell.toFixed(1)}</td>
            <td class="r">${have || ""}</td>
            <td class="cq-trade-btns">
              <button
                class="cq-btn small"
                ?disabled=${load >= CARRY || life.purse < r.buy}
                @click=${() => trade(g, 1)}
              >
                Buy 1
              </button>
              <button
                class="cq-btn small"
                ?disabled=${load + 5 > CARRY || life.purse < r.buy * 5}
                @click=${() => trade(g, 5)}
              >
                5
              </button>
              <button
                class="cq-btn small"
                ?disabled=${have < 1}
                @click=${() => trade(g, -have)}
              >
                Sell all
              </button>
            </td>
          </tr>`;
        })}
      </tbody>
    </table>
  `;
}

// ---------------------------------------------------------------- a new life, someone else's

function makerPage(ui: GameUi, hooks: ModalHooks): TemplateResult {
  return html`<h2 class="cq-h1">A new life</h2>
    <cq-maker
      .world=${ui.s}
      .signLabel=${"Begin this life"}
      .intro=${html`The world goes on: it's ${formatDate(ui.s.day)}. Make
      someone to drop into it, anywhere your people live now.`}
      @cq-plan=${(e: CustomEvent<LifePlan>) => {
        hooks.newLife(e.detail);
      }}
    ></cq-maker>`;
}

let takeoverQuery = "";

function takeoverPage(ui: GameUi): TemplateResult {
  const s = ui.s;
  const q = takeoverQuery.trim().toLowerCase();
  const all = takeoverCandidates(s);
  // People of note first: rulers and councillors, then those with a trade.
  const score = (id: number) => {
    const c = s.chars[id];
    const n = s.nations[c.nation];
    if (n?.ruler === id) return 3;
    if (n && Object.values(n.council).includes(id)) return 2;
    return c.role ? 1 : 0;
  };
  const list = all
    .filter(
      (c) =>
        !q ||
        `${c.first} ${c.family} ${ui.map.provinces[c.home ?? -1]?.name ?? ""} ${nationName(s.nations[c.nation]?.name ?? "")}`
          .toLowerCase()
          .includes(q),
    )
    .sort((a, b) => score(b.id) - score(a.id) || a.id - b.id)
    .slice(0, 60);
  return html`<h2 class="cq-h1">Take over someone</h2>
    <p class="cq-lede small">
      Anyone grown and living in the Americas can carry your story on: their
      family, their trade, their friends and enemies become yours.
    </p>
    <input
      class="cq-input"
      type="search"
      placeholder="Search by name, place or people"
      .value=${takeoverQuery}
      @input=${(e: Event) => {
        takeoverQuery = (e.target as HTMLInputElement).value;
        ui.redraw();
      }}
    />
    <ul class="cq-folk cq-takeover">
      ${list.map(
        (c) =>
          html`<li>
            <div class="cq-folk-row">
              ${token(ui, c, "small")}
              <span class="cq-folk-text">
                <b>${charName(c)}</b>
                <span class="cq-muted small"
                  >${roleOf(ui, c)}, ${ageOf(s, c)};
                  ${nationName(s.nations[c.nation]?.name ?? "")}${c.home !==
                  undefined
                    ? `, ${ui.map.provinces[c.home]?.name ?? ""}`
                    : ""}</span
                >
              </span>
              <button
                class="cq-btn small primary"
                @click=${async () => {
                  if (await ui.cmd({ k: "takeover", c: c.id })) {
                    ui.modal(null);
                    ui.open({ k: "tab", tab: "here" });
                    ui.toast(`You are ${charName(c)} now.`, "good");
                  }
                }}
              >
                Become
              </button>
            </div>
          </li>`,
      )}
    </ul>
    ${list.length === 0
      ? html`<p class="cq-empty">Nobody by that name.</p>`
      : nothing}`;
}

// ---------------------------------------------------------------- menu, help, end

function menu(ui: GameUi, hooks: ModalHooks): TemplateResult {
  return html`
    <h2 class="cq-h1">The game</h2>
    ${!ui.solo
      ? html`<p>
          Friends can join with the code
          <b class="cq-code">${hooks.code}</b>: they make a character and drop
          into the world as it is.
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
      ${ui.life && !ui.life.watching
        ? html`<button class="cq-btn" @click=${() => ui.modal({ k: "end" })}>
            Your story so far
          </button>`
        : nothing}
      ${settingsBlock(ui)}
      ${hooks.isHost && !ui.s.over
        ? html`<button
            class="cq-btn danger"
            @click=${() => {
              if (
                confirm(
                  "End the game now? Stories and coins are counted as they stand.",
                )
              )
                hooks.endGame();
            }}
          >
            End the game here
          </button>`
        : nothing}
      <button class="cq-btn" @click=${() => hooks.leave()}>
        Leave to the lobby
      </button>
      <p class="cq-muted small">
        ${ui.solo
          ? "Leaving saves your game; pick it up later from the lobby."
          : "Leaving keeps your character; the world goes on without you, and you can come back."}
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
      Ask before travelling (or marching) when I click a province
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
      The people are real portraits, and the scenes behind them paintings and
      prints, of the 1600s and 1700s, now in the public domain. The other
      pictures, sounds and music were shared freely by the people who made them.
      With thanks to:
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
    "One person in the Americas between your start year and 1776: a settler, a soldier, a printer, a planter, a minister, a trader, a warrior or a speaker of one of the native nations. The nations, wars and colonies go on around you, run by the computer. What you make of your life is up to you.",
  ],
  [
    "Time",
    "The world runs day by day. Pause with the space bar; 1 to 4 set the speed (1×, 2×, 4×, 8×). In company the host sets the speed. Alone, the game pauses when something needs your answer.",
  ],
  [
    "Going places",
    "Click any province on the map to see it and the road there: overland or, from a port, by sea. Travel costs days and coins, and the road has its dangers. Your token on the map shows where you are.",
  ],
  [
    "Places and work",
    "Each province has places: the tavern, the church, the market, the fort, the docks, the governor's house, the council fire. Each offers things to do, and work. Every trade is a ladder: serve your months, grow your skills, keep your master happy (or buy the next rung), and you climb.",
  ],
  [
    "People",
    "Everyone you meet has an opinion of you, and it explains itself (point at the number). Talk, flatter, give gifts, borrow, court, marry, make friends and enemies, find a patron, fight duels.",
  ],
  [
    "Health, stress, renown, money",
    "Health falls with age, fever and wounds; at nothing you die. Stress rises with hard work, debt and grief, and wrecks health; drink, prayer and rest bring it down. Renown is who knows your name: it opens offices and causes. Your purse pays for how you live.",
  ],
  [
    "Family and heirs",
    "Marry and have children. When you die your heir carries on as you (a child heir can learn but not work until sixteen). Name your heir on your sheet. With no heir, your story ends and you watch: take over anyone living, or begin a new life.",
  ],
  [
    "The army",
    "Enlist at a fort (or as a warrior at the council fire). You march with your army and share its battles: wounds, renown, promotion. Colonels, generals and war chiefs can take command of an army where it stands and march it themselves.",
  ],
  [
    "Causes and risings",
    "History brings its risings (Bacon's, Leisler's, Pueblo, Pontiac, the Regulators, the Sons of Liberty) and you can found your own. Join at a tavern or council fire; grow it with meetings, pamphlets and arms; then rise. A rising is a real war, and the map changes if it wins.",
  ],
  [
    "Office",
    "Stand for the assembly at the governor's house; seek a place at court; win a council seat. When a governor dies or is recalled, the crown appoints someone of renown and favour, and that could be you. A governor sets taxes, builds, raises militia and makes war and peace.",
  ],
  [
    "Europe",
    "Rich enough (or invited: Parliament, the army in Flanders, a recall) you may sail for Europe from a port. Leave an heir behind and you carry on as them; take everyone and your story ends.",
  ],
  [
    "The end",
    "The world ends on 1 January 1776. Your story is told (the roads you travelled, the moments that mattered) and paid in Derp Coins.",
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
      Keys: space pauses, 1–4 set the speed, + and − zoom, Esc closes things.
      Point at any number to see what made it.
    </p>
  `;
}

function endPage(ui: GameUi, hooks: ModalHooks): TemplateResult {
  const s = ui.s;
  const results = hooks.results;
  const life = ui.life;
  return html`
    <h2 class="cq-h1">
      ${s.over
        ? "1776: the story is told"
        : life?.watching
          ? "The story so far"
          : "Your story so far"}
    </h2>
    ${life
      ? html`<cq-life-story .ui=${ui} .life=${life}></cq-life-story>`
      : nothing}
    ${results
      ? html`<h3 class="cq-h3">Everyone's stories</h3>
          <table class="cq-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Line</th>
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
                    <td>${r.line}</td>
                    <td class="r">${r.score}</td>
                    <td class="r">
                      ${r.coins === null
                        ? html`<span class="cq-muted small"
                            >sign in to earn</span
                          >`
                        : html`<span
                            title=${r.coinLines
                              .map((l) => `${l.line}: ${l.coins}`)
                              .join("\n")}
                            >+${r.coins}</span
                          >`}
                    </td>
                  </tr>`,
              )}
            </tbody>
          </table>
          ${coinBreakdown(results, ui)}`
      : s.lives.length > 1
        ? html`<h3 class="cq-h3">The others</h3>
            <ul class="cq-list">
              ${s.lives
                .filter((l) => l !== life)
                .map(
                  (l) => html`<li><b>${l.name}</b>: ${lifeTitle(s, l)}</li>`,
                )}
            </ul>`
        : nothing}
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

function coinBreakdown(results: ResultLine[], ui: GameUi): TemplateResult {
  const mine = results.find((r) => r.name === ui.life?.name);
  if (!mine?.coinLines.length) return html``;
  return html`<details class="cq-more">
    <summary>Your coins, line by line</summary>
    <table class="cq-table compact">
      <tbody>
        ${mine.coinLines.map(
          (l) =>
            html`<tr>
              <td>${l.line}</td>
              <td class="r">${l.coins}</td>
            </tr>`,
        )}
      </tbody>
    </table>
  </details>`;
}
