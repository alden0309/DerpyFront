// LEGACY (r21): a finished Derpy Conquest game, the way DerpyFront games
// have their replays: /chronicle/<id>. Every player, every character their
// line was with their stats (the heirs too), the family's line, and the
// chronicle of each line, chapter by chapter, as the end of the game told
// it (nothing secret). Games finished before round 21 show their results.

import { html, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  ConquestGamePage,
  LineCharacter,
  StoredChronicle,
} from "../conquest/Protocol";
import { api, ApiError } from "../derpland/Account";
import { coinIcon, crownIcon, scrollIcon } from "../derpland/Icons";
import "./chronicle.css";
import {
  DIFFICULTY_NAMES,
  duration,
  nationName,
  nf,
  shortDate,
} from "./format";
import { dynastyHref, treeIcon } from "./Dynasty"; // TREE (r25)
import { HubPage } from "./HubPage";

type Player = ConquestGamePage["players"][number];

const STATS: [keyof LineCharacter["stats"], string][] = [
  ["dip", "Diplomacy"],
  ["mar", "Martial"],
  ["ste", "Stewardship"],
  ["int", "Intrigue"],
  ["lea", "Learning"],
];

const CAME: Record<string, string> = {
  born: "began the line",
  begin: "began anew",
  heir: "heir",
  takeover: "taken up",
};

@customElement("dl-conquest-game")
export class DerpConquestGame extends HubPage {
  @property({ type: String }) gameId = "";
  @state() private page: ConquestGamePage | null = null;
  @state() private error: string | null = null;

  private loaded = "";

  protected updated(changed: Map<string, unknown>): void {
    // The id may come after the page is on the screen.
    if (changed.has("gameId") && this.gameId !== this.loaded) void this.load();
  }

  protected async load(): Promise<void> {
    if (!this.gameId || this.loaded === this.gameId) return;
    this.loaded = this.gameId;
    try {
      this.page = await api<ConquestGamePage>(
        `/conquest/game/${encodeURIComponent(this.gameId)}`,
      );
      document.title = `${titleOf(this.page)} · Derp Land`;
    } catch (e) {
      this.error =
        e instanceof ApiError && e.code === "not_found"
          ? "There's no finished game here."
          : e instanceof ApiError && e.code === "accounts_unavailable"
            ? "Game results aren't available on this server."
            : "Couldn't load this game. Refresh to try again.";
    }
  }

  render(): TemplateResult {
    if (this.error) return html`<p class="dl-panel dl-quiet">${this.error}</p>`;
    const g = this.page;
    if (!g) return html`<p class="dl-quiet">Loading…</p>`;
    const told = g.players.some((p) => p.chronicle);
    return html`
      <header class="dl-chron-head">
        <p class="dl-chron-kicker">${scrollIcon("dl-i")} Derpy Conquest</p>
        <h1 class="dl-h1 dl-chron-title">${titleOf(g)}</h1>
        <p class="dl-lede">
          Played to
          ${g.finalYear}${g.finalYear >= g.endYear
            ? ""
            : ` (the game ends in ${g.endYear})`},
          ${DIFFICULTY_NAMES[g.difficulty] ?? g.difficulty},
          ${duration(g.durationS)} at the table, finished
          ${shortDate(g.endedAt)}.
        </p>
      </header>
      <section class="dl-panel dl-chron-results">
        <h2 class="dl-h2">The lines, ranked</h2>
        <ol class="dl-chron-ranks">
          ${g.players.map((p) => rankRow(p))}
        </ol>
      </section>
      ${told
        ? g.players.map((p) => playerSection(p, g.gameId))
        : html`<p class="dl-panel dl-quiet">
            This game was played before Derp Land kept each line's characters
            and chronicle: only the results remain.
          </p>`}
    `;
  }
}

function titleOf(g: ConquestGamePage): string {
  const fams = g.players
    .map((p) => p.chronicle?.title.match(/^The (.+?) (line|story),/)?.[1])
    .filter((x): x is string => !!x);
  if (!fams.length) return `A game played to ${g.finalYear}`;
  const names = fams.map((f) =>
    /^of the /.test(f) ? `a family ${f}` : `the ${f}s`,
  );
  const who =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${who.charAt(0).toUpperCase()}${who.slice(1)}, to ${g.finalYear}`;
}

function who(p: Player): TemplateResult {
  return p.username
    ? html`<a href="/player/${encodeURIComponent(p.username)}"
        >${p.username}</a
      >`
    : html`<span>${p.name}</span>`;
}

function rankRow(p: Player): TemplateResult {
  return html`<li class=${p.won ? "won" : ""}>
    <span class="dl-place p${p.rank}">${p.rank}</span>
    <span class="dl-chron-rank-who">
      ${who(p)}
      <span class="dl-quiet">
        ${p.line ? html`the line of ${p.line}, ` : nothing}from
        ${nationName(p.nation)}${p.chars?.length
          ? `, ${p.chars.length} ${p.chars.length === 1 ? "life" : "lives"}`
          : ""}</span
      >
    </span>
    ${p.won
      ? html`<span class="dl-result won">${crownIcon("dl-i")} Won</span>`
      : html`<span></span>`}
    <span class="dl-chron-score">${nf(p.score)} points</span>
    <span class="dl-game-coins"
      >${p.coins === null || p.coins === undefined
        ? html`<span class="dl-quiet">guest</span>`
        : html`+${nf(p.coins)} ${coinIcon("dl-coin sm")}`}</span
    >
  </li>`;
}

function playerSection(p: Player, gameId?: string): TemplateResult {
  const ch = p.chronicle;
  return html`<section class="dl-panel dl-chron">
    <h2 class="dl-h2 dl-chron-h2">
      <span class="dl-chron-rank">${p.rank}</span>
      ${ch?.title ?? p.line ?? p.name}
      <small class="dl-quiet">played by ${who(p)}</small>
      ${p.username && p.chars?.length && gameId
        ? // TREE (r25): the line's family tree.
          html`<a
            class="dl-btn small ghost dl-chron-tree-link"
            href=${dynastyHref(p.username, gameId)}
            >${treeIcon()} Family tree</a
          >`
        : nothing}
    </h2>
    ${ch ? html`<p class="dl-chron-open">${ch.opening}</p>` : nothing}
    ${ch?.numbers.length
      ? html`<dl class="dl-chron-numbers">
          ${ch.numbers.map(
            (n) =>
              html`<div>
                <dt>${n.label}</dt>
                <dd>${n.value}</dd>
              </div>`,
          )}
        </dl>`
      : nothing}
    ${p.chars?.length
      ? html`<h3 class="dl-chron-h3">
            Every character
            ${p.chars.length === 1 ? "they were" : "of the line"}
          </h3>
          <ol class="dl-chron-chars">
            ${p.chars.map((c, i) => charCard(c, i))}
          </ol>`
      : nothing}
    ${ch && ch.tree.length ? familyLine(ch) : nothing}
    ${ch?.chapters.length
      ? html`<h3 class="dl-chron-h3">The chronicle</h3>
          ${ch.chapters.map(
            (c, i) =>
              html`<details class="dl-chron-chapter" ?open=${i === 0}>
                <summary>
                  <span class="dl-chron-roman">${c.roman}</span>
                  <span class="dl-chron-ch-name">${c.name}</span>
                  <span class="dl-quiet"
                    >${c.years}${c.title ? `, ${c.title}` : ""}</span
                  >
                </summary>
                ${c.paras.map((t) => html`<p>${t}</p>`)}
                ${c.people.length
                  ? html`<p class="dl-chron-people">
                      <b>The people who mattered:</b>
                      ${c.people.map(
                        (x, j) =>
                          html`${j ? ", " : ""}${x.name}
                            <span class="dl-quiet">(${x.role})</span>`,
                      )}
                    </p>`
                  : nothing}
              </details>`,
          )}
          <p class="dl-chron-close">${ch.closing}</p>`
      : nothing}
  </section>`;
}

function charCard(c: LineCharacter, i: number): TemplateResult {
  const years = `${c.from}–${c.to ?? ""}`;
  const fact = (label: string, value: string | number) =>
    html`<div>
      <dt>${label}</dt>
      <dd>${value}</dd>
    </div>`;
  return html`<li class="dl-chron-char ${c.ended}">
    <div class="dl-chron-char-head">
      <span class="dl-chron-gen">${i + 1}</span>
      <div>
        <b>${c.name}</b>
        <span class="dl-quiet"
          >${c.born}–${c.ended === "living" ? "" : (c.to ?? "")} · in the line
          ${years} · ${CAME[c.came] ?? c.came}</span
        >
        <span class="dl-chron-fate"
          >${cap(c.title || "of no fixed trade")}${c.office
            ? `; ${c.office}`
            : ""}${c.home ? `, ${c.home}` : ""}.
          ${cap(c.fate)}.</span
        >
      </div>
    </div>
    <dl class="dl-chron-facts">
      ${fact("Age", c.age)} ${fact("Renown", nf(c.renown))}
      ${fact("Purse", nf(c.purse))} ${fact("Earned", nf(c.earned))}
      ${fact("Children", c.children)}
      ${fact("Battles", c.battles ? `${c.battles} (${c.battlesWon} won)` : "0")}
      ${fact("Duels", c.duels)} ${fact("Wounds", c.wounds)}
      ${fact("Places", c.places)} ${fact("Fighting", c.fighting)}
      ${fact("Health", c.health)}
      ${c.spouse ? fact(c.female ? "Husband" : "Wife", c.spouse) : nothing}
    </dl>
    <p class="dl-chron-skills">
      ${c.skills.length
        ? html`<b>Best at</b> ${c.skills
              .map(([k, v]) => `${k} ${v}`)
              .join(", ")}.`
        : nothing}
      <b>Attributes</b>
      ${STATS.map(([k, n]) => `${n} ${c.stats[k]}`).join(", ")}.
      ${c.traits.length
        ? html`<b>Traits</b> ${c.traits.map((t) => cap(t)).join(", ")}.`
        : nothing}
    </p>
  </li>`;
}

function familyLine(ch: StoredChronicle): TemplateResult {
  return html`<h3 class="dl-chron-h3">The family's line</h3>
    <ol class="dl-chron-tree">
      ${ch.tree.map(
        (t) =>
          html`<li>
            <div class="dl-chron-tree-who">
              <b>${t.name}</b> <span class="dl-quiet">${t.years}</span>
              ${t.spouses.length
                ? html`<span class="dl-quiet"
                    >· married ${t.spouses.join(", then ")}</span
                  >`
                : nothing}
            </div>
            ${t.children.length
              ? html`<ul class="dl-chron-kids">
                  ${t.children.map(
                    (k) =>
                      html`<li
                        class="${k.heir ? "heir" : ""} ${k.young
                          ? "young"
                          : ""}"
                        title=${k.heir
                          ? "Carried the line on"
                          : k.young
                            ? "Died young"
                            : ""}
                      >
                        ${k.name} <span class="dl-quiet">${k.born}</span>
                      </li>`,
                  )}
                </ul>`
              : nothing}
          </li>`,
      )}
    </ol>`;
}

function cap(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

declare global {
  interface HTMLElementTagNameMap {
    "dl-conquest-game": DerpConquestGame;
  }
}
