// HOME (r12): the other players in your world, as people in it. In your
// town they stand in its places like anyone else (marked as players, with
// whose they are), a strip at the top of Here says who's in town and where,
// and People lists them all: where they are if you can see it (the fog of
// war holds for them too), what they are to you, and the way to them.

import { html, nothing, TemplateResult } from "lit";
import { areaName, findIn } from "../../engine/Areas";
import { lifeOfChar, meOf, opinionOf } from "../../engine/LifeQueries";
import { ageOf, charName } from "../../engine/Queries";
import type { Character, Life } from "../../engine/Types";
import { GameUi, section, token } from "./Context";
import { roleOf } from "./Here";
import { sightOf } from "./WorldUi";

/** The other players' lives with a character in the world. */
function others(ui: GameUi): { l: Life; c: Character }[] {
  const out: { l: Life; c: Character }[] = [];
  for (const l of ui.s.lives) {
    if (l.seat === ui.seat || l.watching || l.c < 0) continue;
    const c = meOf(ui.s, l);
    if (c?.alive) out.push({ l, c });
  }
  return out;
}

/** "player" (or "rival player"; or "player · Hal" with the name), for anyone played by someone else. */
export function playerTag(
  ui: GameUi,
  c: Character,
  withName = false,
): TemplateResult | typeof nothing {
  const l = lifeOfChar(ui.s, c.id);
  if (!l || l.seat === ui.seat) return nothing;
  const tie = ui.life?.ties[c.id];
  const rival = tie === "rival" || tie === "nemesis";
  return html`<span
    class="cq-chip player ${rival ? "rival" : ""}"
    title=${`Another player: ${l.name}. What you ask of them goes to them to answer.`}
    >${withName
      ? `player · ${l.name}`
      : rival
        ? "rival player"
        : "player"}</span
  >`;
}

/** Where another player is, as far as you can tell. */
function whereabouts(ui: GameUi, l: Life, c: Character): string {
  const life = ui.life;
  const here = life && !life.travel ? life.prov : -1;
  const name = (p: number) => ui.map.provinces[p]?.name ?? "somewhere";
  if (l.travel) {
    const p = l.travel.path[0];
    return sightOf(ui, l.prov) === "seen" || sightOf(ui, p) === "seen"
      ? `on the road to ${name(l.travel.dest)}`
      : "out of sight";
  }
  if (l.prov === here) {
    const at = findIn(ui.s, ui.w, here, c.id, ui.s.day, life);
    return at
      ? `here in ${name(here)}, ${areaName(ui.s, here, at.area).replace(/^The /, "the ").toLowerCase()}`
      : `here in ${name(here)}, at home`;
  }
  const sight = sightOf(ui, l.prov);
  return sight === "seen" || sight === "all"
    ? `at ${name(l.prov)}`
    : "out of sight";
}

/** At the top of Here: the players in town, and where to find them. */
export function playersHere(ui: GameUi): TemplateResult | typeof nothing {
  const life = ui.life;
  if (!life || life.travel || life.c < 0) return nothing;
  const list = others(ui).filter(({ l }) => !l.travel && l.prov === life.prov);
  if (!list.length) return nothing;
  return html`<div class="cq-players-here" aria-label="Players in town">
    <span class="cq-players-head">In town</span>
    ${list.map(({ l, c }) => {
      const at = findIn(ui.s, ui.w, life.prov, c.id, ui.s.day, life);
      return html`<button
        class="cq-player-pill"
        style="--frame:${l.frame}"
        title=${`${charName(c)}, played by ${l.name}`}
        @click=${async () => {
          if (at && at.area !== life.area)
            await ui.cmd({ k: "enter", area: at.area });
          ui.open({ k: "char", c: c.id });
        }}
      >
        ${token(ui, c, "xs")}
        <span
          ><b>${charName(c)}</b>
          <small
            >${l.name} ·
            ${at
              ? areaName(ui.s, life.prov, at.area).replace(/^The /, "")
              : "at home"}</small
          ></span
        >
      </button>`;
    })}
  </div>`;
}

/** Their place in the world, if it's more than "played by". */
function roleText(ui: GameUi, c: Character): string {
  const r = roleOf(ui, c);
  return r.startsWith("Played by") ? "" : `${r}, `;
}

/** People: every other player, where they are, and what they are to you. */
export function playersSection(ui: GameUi): TemplateResult | typeof nothing {
  const life = ui.life;
  if (!life || life.c < 0) return nothing;
  const list = others(ui);
  if (!list.length) return nothing;
  const here = life.travel ? -1 : life.prov;
  list.sort(
    (a, b) =>
      Number(b.l.prov === here) - Number(a.l.prov === here) || a.c.id - b.c.id,
  );
  return section(
    "Other players",
    html`<ul class="cq-folk cq-players">
        ${list.map(({ l, c }) => {
          const op = opinionOf(ui.s, c, life).total;
          const tie = life.ties[c.id];
          return html`<li>
            <button
              class="cq-folk-row"
              @click=${() => ui.open({ k: "char", c: c.id })}
            >
              ${token(ui, c, "small")}
              <span class="cq-folk-text">
                <b>${charName(c)}</b>
                <span class="cq-muted small"
                  >${roleText(ui, c)}${ageOf(ui.s, c)} ·
                  ${whereabouts(ui, l, c)}${tie
                    ? html` · <span class="cq-tie ${tie}">${tie}</span>`
                    : nothing}</span
                >
              </span>
              ${playerTag(ui, c, true)}
              <span
                class="cq-opinion ${op >= 20 ? "good" : op <= -20 ? "bad" : ""}"
                >${op > 0 ? "+" : ""}${op}</span
              >
            </button>
          </li>`;
        })}
      </ul>
      <p class="cq-muted small">
        Players in your town stand in its places like anyone else. What you ask
        of them (friendship, a match, a duel, work, a trade) goes to them to
        answer; letters reach them wherever they are.
      </p>`,
  );
}
