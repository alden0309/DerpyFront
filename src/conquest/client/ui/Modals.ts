// Things that stop the game to be read: what happens to you and needs an
// answer, battle reports, the market, making a new character or taking over
// someone, the menu, the rules and the end of the story.

import { html, nothing, TemplateResult } from "lit";
import {
  MAP_STYLE_NAMES,
  MAP_STYLE_PALETTES,
  MAP_STYLES,
  type MapStyleKey,
} from "../../DlcIds"; // DLC (r21)
import { ACHIEVEMENT_BY_KEY } from "../../engine/Achievements"; // CQACH (r22)
import { formatDate } from "../../engine/Calendar";
import { endWords } from "../../engine/Campaign1776Core"; // DLC (r21)
import { lifeTitle, takeoverCandidates } from "../../engine/LifeQueries";
import { PLAY_PAY } from "../../engine/LifeRules"; // LEGACY (r21)
import { ageOf, charName } from "../../engine/Queries";
import { REG_NAMES } from "../../engine/Rules";
import type { BattleSide, LifePlan, RegType } from "../../engine/Types";
import type { ResultLine } from "../../Protocol";
import { creditsList } from "../Credits";
import { dlcOwned, STORE_MAP_STYLES } from "../Dlc"; // DLC (r21)
import { flagFor } from "../Flags";
import { guideOverlay } from "../guide/Guide";
import "../Maker";
import { chooseMapStyle, mapStyleToDraw } from "../MapStylePref"; // DLC (r21)
import { confirmMarch, setConfirmMarch } from "../Prefs";
import "../Range";
import { music, play, setSoundSettings, soundSettings } from "../Sound";
import { nationName } from "../Text";
import { medal } from "./Achievements"; // CQACH (r22)
import {
  battleVerdict,
  myBattleNation,
  reasonList,
  strengthBars,
} from "./Battle";
import { bondModal } from "./Bonds"; // ECON (r17)
import { startBizModal } from "./Business"; // BUSINESS (r15)
import { cardsModal } from "./CardsTable"; // EVENTS (r21)
import { GameUi, Modal, token } from "./Context";
import { diceModal } from "./DiceTable"; // DICE (r14)
import { familyTreeModal } from "./FamilyTree"; // HOME (r12)
import { finderModal, resetFinder } from "./Finder";
import { roleOf } from "./Here";
import { intrigueModal } from "./Intrigue"; // INTRIGUE (r15)
import { articlesModal } from "./Partners"; // PARTNERS (r13)
import { eventScene, interactScene, outcomeScene } from "./Scene";
import { indentureModal, schoolModal } from "./Schooling"; // EDU (r13)
import { sittingPage } from "./Sitting";
// SOCIETY (r11)
import { constituteModal } from "./Civic";
import { hostModal, writeModal } from "./Society";
import "./Story";
import { marketPage } from "./WorldUi";

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
  /** SITE (r19): watching (no seat), how many watch, and letting them. */
  watcher?: boolean;
  watchers?: number;
  allowWatchers?: boolean;
  /** Open to anyone (so anyone may watch it too). */
  openRoom?: boolean;
  setAllowWatchers?(allow: boolean): void;
}

export function renderModal(
  ui: GameUi,
  m: Modal,
  hooks: ModalHooks,
): TemplateResult {
  // The guide is a book of its own, over everything (r11 wave 2).
  if (m.k === "guide" || m.k === "help")
    return guideOverlay(m.k === "guide" ? m.ch : "start", () => ui.modal(null));
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
    case "finder":
      body = finderModal(ui);
      cls = "finder";
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
      // WORLD r11: the province's own market, prices that answer to trade.
      body = marketPage(ui);
      break;
    // SOCIETY (r11)
    case "write":
      body = writeModal(ui, m);
      cls = "wide society";
      break;
    case "host":
      body = hostModal(ui);
      cls = "wide society";
      break;
    case "constitute":
      body = constituteModal(ui);
      cls = "wide society";
      break;
    // HOME (r12)
    case "tree":
      body = familyTreeModal(ui);
      cls = "wide kin";
      break;
    // EDU (r13)
    case "school":
      body = schoolModal(ui, m.c);
      cls = "wide school";
      break;
    case "indenture":
      body = indentureModal(ui, m.c);
      cls = "indenture";
      break;
    // PARTNERS (r13)
    case "articles":
      body = articlesModal(ui, m);
      cls = "wide partners";
      break;
    // DICE (r14)
    case "dice":
      body = diceModal(ui, m);
      cls = "scene dice";
      break;
    // EVENTS (r21)
    case "cards":
      body = cardsModal(ui, m);
      cls = "scene cards";
      break;
    // BUSINESS (r15)
    case "startbiz":
      body = startBizModal(ui);
      cls = "wide partners startbiz";
      break;
    // INTRIGUE (r15)
    case "intrigue":
      body = intrigueModal(ui, m);
      cls = `intrigue ${m.what === "wedding" || m.what === "plot" ? "wide" : ""}`;
      break;
    // ECON (r17)
    case "bond":
      body = bondModal(ui, m);
      cls = "bond";
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

/** SITE (r19): the menu for someone watching: no seat, nothing to save or end. */
function watcherMenu(ui: GameUi, hooks: ModalHooks): TemplateResult {
  const n = hooks.watchers ?? 0;
  return html`
    <h2 class="cq-h1">Watching</h2>
    <p>
      You're watching this game from Derp Land: the map, the armies, the news
      and the players as anyone may see them. You can't change anything, and
      nothing a player keeps to themselves reaches you.
    </p>
    <p class="cq-muted small">
      ${n === 1
        ? "You're the only one watching."
        : `${n} people are watching, you among them.`}
      The players see how many watch.
    </p>
    <div class="cq-menu">
      <div class="cq-menu-help">
        <button
          class="cq-btn primary"
          @click=${() => ui.modal({ k: "guide", ch: "start" })}
        >
          How to play
        </button>
      </div>
      ${settingsBlock(ui)}
      <button class="cq-btn" @click=${() => hooks.leave()}>
        Stop watching
      </button>
    </div>
  `;
}

/** SITE (r19): letting people watch from Derp Land (the host's say, in a private game). */
function watchersPart(hooks: ModalHooks): TemplateResult | typeof nothing {
  const n = hooks.watchers ?? 0;
  const many = n
    ? ` ${n} ${n === 1 ? "person is" : "people are"} watching now.`
    : "";
  if (hooks.openRoom)
    return html`<p class="cq-muted small">
      Anyone can watch this game from Derp Land: it's open to all.${many}
    </p>`;
  if (!hooks.isHost)
    return html`<p class="cq-muted small">
      ${hooks.allowWatchers
        ? `The host lets people watch this game from Derp Land.${many}`
        : "Nobody can watch this game but its players."}
    </p>`;
  return html`<label class="cq-check">
      <input
        type="checkbox"
        .checked=${hooks.allowWatchers === true}
        @change=${(e: Event) =>
          hooks.setAllowWatchers?.((e.target as HTMLInputElement).checked)}
      />
      Let people watch from Derp Land
    </label>
    <p class="cq-muted small">
      Watchers see the map, the armies, the news and the players as anyone may,
      never what's private to you.${many}
    </p>`;
}

function menu(ui: GameUi, hooks: ModalHooks): TemplateResult {
  if (hooks.watcher) return watcherMenu(ui, hooks); // SITE (r19)
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
      <div class="cq-menu-help">
        <button
          class="cq-btn primary"
          @click=${() => ui.modal({ k: "guide", ch: "start" })}
        >
          How to play
        </button>
        ${ui.life && !ui.life.watching
          ? html`<button
              class="cq-btn"
              @click=${() => {
                resetFinder();
                ui.modal({ k: "finder" });
              }}
            >
              I want to…
            </button>`
          : nothing}
      </div>
      <p class="cq-muted small">
        Every page has a <b>?</b> for its chapter of the guide; point at (or
        tap) any number for what it is and how to raise it. Keys: <b>?</b> the
        guide, <b>/</b> I want to…
      </p>
      ${ui.life && !ui.life.watching
        ? html`<button class="cq-btn" @click=${() => ui.modal({ k: "end" })}>
            Your story so far
          </button>`
        : nothing}
      ${settingsBlock(ui)} ${watchersPart(hooks) /* SITE (r19) */}
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
    ${mapStylePicker(ui) /* DLC (r21) */}
    <button class="cq-link small" @click=${() => ui.modal({ k: "credits" })}>
      Credits for the art, sounds and music
    </button>
  </fieldset>`;
}

/**
 * DLC (r21): the map's style. The usual chart, and each style of the Derp
 * Store: the ones the account owns can be chosen (only you see it), the
 * others show where they're sold.
 */
function mapStylePicker(ui: GameUi): TemplateResult {
  const owned = dlcOwned().styles;
  const now = mapStyleToDraw(owned);
  const pick = (key: MapStyleKey | null) => {
    chooseMapStyle(key);
    ui.redraw();
  };
  const swatch = (bg: string) =>
    html`<span class="cq-mapstyle-swatch" style="background:${bg}"></span>`;
  return html`<div class="cq-field">
    <span class="cq-field-label" id="cq-mapstyle-label">Map style</span>
    <div
      class="cq-mapstyles"
      role="radiogroup"
      aria-labelledby="cq-mapstyle-label"
    >
      <button
        class="cq-mapstyle"
        role="radio"
        aria-checked=${now === null}
        @click=${() => pick(null)}
      >
        ${swatch("linear-gradient(135deg, #2f6577 0 50%, #ece0b4 50% 100%)")}
        The usual chart
      </button>
      ${MAP_STYLES.map((key) => {
        const p = MAP_STYLE_PALETTES[key];
        const has = owned.includes(key);
        return html`<button
          class="cq-mapstyle"
          role="radio"
          aria-checked=${now === key}
          ?disabled=${!has}
          title=${has ? "" : "In the Derp Store"}
          @click=${() => has && pick(key)}
        >
          ${swatch(
            `linear-gradient(135deg, ${p.sea} 0 50%, ${p.land} 50% 100%); border-color:${p.ink}`,
          )}
          ${MAP_STYLE_NAMES[key]}
          ${has
            ? nothing
            : html`<span class="cq-mapstyle-lock">In the Derp Store</span>`}
        </button>`;
      })}
    </div>
    <p class="cq-muted small">
      Only you see it; it changes nothing in the game.
      ${owned.length < MAP_STYLES.length
        ? html`More in the
            <a href=${STORE_MAP_STYLES} target="_blank">Derp Store</a>.`
        : nothing}
    </p>
  </div>`;
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

function endPage(ui: GameUi, hooks: ModalHooks): TemplateResult {
  const s = ui.s;
  const results = hooks.results;
  const life = ui.life;
  return html`
    <h2 class="cq-h1">
      ${s.over
        ? `${endWords(s).year}: the story is told`
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
          ${coinBreakdown(results, ui)}
          ${achievementsAtEnd(results, ui) /* CQACH (r22) */}
          ${everyCharacter(results, ui)}`
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

// ---------------------------------------------------------------- CQACH (r22): achievements at the end

/**
 * The game's achievements at the end: yours, this game's (each with what it
 * paid in the game) and the overall ones your account first earned in it
 * (on Hard), and how many everyone else earned.
 */
function achievementsAtEnd(
  results: ResultLine[],
  ui: GameUi,
): TemplateResult | typeof nothing {
  const withAch = results.filter((r) => r.ach);
  if (!withAch.length) return nothing;
  const mine = results.find((r) => r.name === ui.life?.name)?.ach;
  const others = withAch.filter((r) => r.name !== ui.life?.name);
  const item = (key: string, coins: number, metal: "gold" | "silver") => {
    const def = ACHIEVEMENT_BY_KEY.get(key);
    return def
      ? html`<li title=${def.how}>
          ${medal(def, metal)}<span class="name">${def.name}</span
          ><span class="cq-ach-coins">${coins}</span>
        </li>`
      : nothing;
  };
  const sum = (l: { coins: number }[]) => l.reduce((n, x) => n + x.coins, 0);
  return html`<h3 class="cq-h3">Achievements</h3>
    ${mine
      ? html`<p class="cq-muted small">
            <b>This game's:</b> ${mine.game.length}, worth ${sum(mine.game)}
            Derp Coins in this game (paid with your line's marks, held to the
            time played).
          </p>
          ${mine.game.length
            ? html`<ul class="cq-end-ach">
                ${mine.game.map((x) => item(x.key, x.coins, "silver"))}
              </ul>`
            : nothing}
          <p class="cq-muted small">
            <b>Overall:</b>
            ${mine.overall === null
              ? "playing as a guest, nothing goes onto an account."
              : !mine.hard
                ? "this game wasn't on Hard, so it didn't count for your account's achievements."
                : mine.overall.length
                  ? `${mine.overall.length} new on your account, ${sum(mine.overall)} Derp Coins.`
                  : "nothing new on your account this time."}
          </p>
          ${mine.overall?.length
            ? html`<ul class="cq-end-ach">
                ${mine.overall.map((x) => item(x.key, x.coins, "gold"))}
              </ul>`
            : nothing}`
      : nothing}
    ${others.length
      ? html`<p class="cq-muted small">
          ${others
            .map(
              (r) =>
                `${r.name}: ${r.ach!.game.length} in this game${r.ach!.overall?.length ? `, ${r.ach!.overall.length} new overall` : ""}`,
            )
            .join("; ")}.
        </p>`
      : nothing}`;
}
// ---------------------------------------------------------------- /CQACH (r22)

/** LEGACY (r21): every character each player's line was, with their stats. */
function everyCharacter(results: ResultLine[], ui: GameUi): TemplateResult {
  const withChars = results.filter((r) => r.chars?.length);
  if (!withChars.length) return html``;
  return html`<h3 class="cq-h3">Every character they were</h3>
    ${withChars.map(
      (r) =>
        html`<details
          class="cq-end-chars"
          ?open=${r.name === ui.life?.name || withChars.length === 1}
        >
          <summary>
            <b>${r.name}</b>: ${r.chars!.length}
            ${r.chars!.length === 1 ? "life" : "lives"}, the line of ${r.line}
          </summary>
          <div class="cq-table-wrap">
            <table class="cq-table compact">
              <thead>
                <tr>
                  <th>Character</th>
                  <th>What they were</th>
                  <th class="r">Renown</th>
                  <th class="r">Purse</th>
                  <th class="r">Children</th>
                  <th class="r">Battles</th>
                  <th class="r">Duels</th>
                  <th>Best at</th>
                </tr>
              </thead>
              <tbody>
                ${r.chars!.map(
                  (c) =>
                    html`<tr>
                      <td>
                        ${ui.s.chars[c.c]
                          ? html`<button
                              class="cq-link"
                              @click=${() => ui.open({ k: "char", c: c.c })}
                            >
                              ${c.name}
                            </button>`
                          : c.name}
                        <small
                          >${c.born}–${c.ended === "living"
                            ? ""
                            : (c.to ?? "")};
                          ${c.fate}</small
                        >
                      </td>
                      <td>
                        ${c.title || "Of no fixed trade"}${c.office
                          ? html`<small>${c.office}</small>`
                          : nothing}
                        ${c.home ? html`<small>${c.home}</small>` : nothing}
                      </td>
                      <td class="r">${c.renown}</td>
                      <td class="r">${c.purse}</td>
                      <td class="r">${c.children}</td>
                      <td class="r">
                        ${c.battles ? `${c.battles} (${c.battlesWon})` : 0}
                      </td>
                      <td class="r">${c.duels}</td>
                      <td>
                        ${c.skills.map(([k, v]) => `${k} ${v}`).join(", ")}
                      </td>
                    </tr>`,
                )}
              </tbody>
            </table>
          </div>
        </details>`,
    )}`;
}

function coinBreakdown(results: ResultLine[], ui: GameUi): TemplateResult {
  const mine = results.find((r) => r.name === ui.life?.name);
  // LEGACY (r21): what was paid as you played, and at the end.
  const asPlayed = mine?.timeCoins !== undefined;
  if (!mine || (!mine.coinLines.length && !asPlayed)) return html``;
  return html`<details class="cq-more" ?open=${asPlayed}>
    <summary>Your coins, line by line</summary>
    <table class="cq-table compact">
      <tbody>
        ${asPlayed
          ? html`<tr>
                <td>
                  ${mine.minutes} minute${mine.minutes === 1 ? "" : "s"} at the
                  table (paid as you played)
                </td>
                <td class="r">${mine.timeCoins}</td>
              </tr>
              <tr>
                <td>Your line's marks, paid as they were reached</td>
                <td class="r">${mine.linesInPlay}</td>
              </tr>
              <tr>
                <td>Paid at the end</td>
                <td class="r">${mine.atEnd}</td>
              </tr>
              ${mine.held
                ? html`<tr class="cq-muted">
                    <td>
                      Earned, but more than the time played allows
                      (${PLAY_PAY.linesPerHour} an hour)
                    </td>
                    <td class="r">${mine.held}</td>
                  </tr>`
                : nothing}
              <tr>
                <th colspan="2">The line's marks</th>
              </tr>`
          : nothing}
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
