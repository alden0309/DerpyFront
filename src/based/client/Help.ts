// Mr. Based's "How to play" (r21): walking, looking, the column, his skills
// and the checks. The skills' names come from the chapter (they're the
// writer's, served through the gate), and the odds from the same dice the
// story rolls.

import { html, nothing, TemplateResult } from "lit";
import { percent, TIERS } from "../engine/Dice";
import { Chapter } from "../engine/Types";

const SHOWN_TIERS = [
  "easy",
  "medium",
  "challenging",
  "formidable",
  "legendary",
];

export function helpBody(
  chapter: Chapter,
  colors: string[],
  touch: boolean,
): TemplateResult {
  const click = touch ? "Tap" : "Click";
  const tiers = TIERS.filter((t) => SHOWN_TIERS.includes(t.id));
  const example = chapter.skills[0]?.name ?? "Skill";
  return html`<h2>How to play</h2>
    <p class="mb-sheet-sub">
      Walk him round the place, look at things, talk. His skills do the rest:
      they notice, they speak up, and when it matters he rolls the dice.
    </p>

    <div class="mb-panel-sub">Walking and looking</div>
    <ul class="mb-help">
      <li>
        ${click} the floor and he walks
        there${touch
          ? nothing
          : html`; the mouse wheel moves the camera in and out`}.
      </li>
      <li>
        Diamonds mark what he can look at. ${click} one, or its line in the
        column, and he walks over and looks.
        ${touch
          ? html`The eye button shows them all.`
          : html`Hold <kbd>Tab</kbd>, or turn on the eye, to show them all.`}
      </li>
      <li>
        Blue diamonds are ways out. When he has seen enough, the button at the
        foot of the column moves the story on; some scenes only give him time
        for a few looks.
      </li>
      <li>
        Sometimes he doesn't move: reading a man beside him, he uses the mirror
        and the corner of his eye, and the marks sit on what he can see from
        where he is.
      </li>
    </ul>

    <div class="mb-panel-sub">The column</div>
    <ul class="mb-help">
      <li>
        The story runs down the column
        ${touch ? "at the bottom" : "on the right"}. ${click} it, the world,
        ${touch ? nothing : html`<kbd>Space</kbd> or <kbd>Enter</kbd>`} to read
        on.
      </li>
      <li>
        Choices are numbered: ${click.toLowerCase()}
        one${touch ? nothing : html` or press its number`}.
      </li>
      <li>
        A name in colour is one of his skills, talking in his head. The colour
        is the skill's attribute.
      </li>
    </ul>

    <div class="mb-panel-sub">His skills</div>
    <ul class="mb-help mb-help-skills">
      ${chapter.attributes.map(
        (a, i) =>
          html`<li style="--c:${colors[i % colors.length]}">
            <b>${a.name}</b>:
            ${chapter.skills
              .filter((s) => s.attr === a.id)
              .map((s) => s.name)
              .join(", ")}
          </li>`,
      )}
    </ul>
    <p class="mb-help-p">
      Each skill starts at its attribute; the one he's known for starts a step
      higher. Some memories raise a skill for the rest of the chapter. His sheet
      (the figure at the top${touch ? nothing : html`, or <kbd>C</kbd>`}) shows
      where he stands.
    </p>

    <div class="mb-panel-sub">Checks</div>
    <ul class="mb-help">
      <li>
        A check reads like <b>[${example} – Challenging 10] 58%</b>. He throws
        two dice and adds the skill and any bonuses; reaching the difficulty
        passes. A double six always passes, a double one always fails.
        ${touch ? nothing : html`Point at a check to see its bonuses.`}
      </li>
      <li>
        <b class="mb-help-white">White</b> checks can be tried again once
        something changes: a new bonus from something he noticed or heard, or a
        higher skill. Until then they stay locked, and say why.
        <b class="mb-help-red">Red</b> checks are one throw.
      </li>
      <li>
        Some checks have no dice. A skill speaks up by itself when it's good
        enough: the skill plus six reaching the difficulty.
      </li>
      <li>
        Under <i>What it means</i>, a deduction comes to him by itself when he's
        noticed what it needs and the skill is good enough. If not, it becomes a
        white check, one easier for every other thing he has noticed in the
        room.
      </li>
    </ul>
    <table class="mb-odds">
      <caption>
        The chance of passing, by skill and bonuses
      </caption>
      <thead>
        <tr>
          <th></th>
          ${tiers.map(
            (t) => html`<th>${t.name}<br /><span>${t.diff}</span></th>`,
          )}
        </tr>
      </thead>
      <tbody>
        ${[1, 2, 3, 4, 5, 6].map(
          (s) =>
            html`<tr>
              <th>${s}</th>
              ${tiers.map((t) => {
                const p = percent(s, t.diff);
                return html`<td class=${s + 6 >= t.diff ? "sure" : ""}>
                  ${p}%
                </td>`;
              })}
            </tr>`,
        )}
      </tbody>
    </table>
    <p class="mb-help-p small">
      Underlined: the skill also speaks up there without a throw.
    </p>

    <div class="mb-panel-sub">Saving, and notes for the writer</div>
    <ul class="mb-help">
      <li>
        The game saves as he goes. <i>Continue</i> picks up at the start of the
        scene you were in; <i>Chapters and checkpoints</i> plays again from any
        checkpoint you've reached. A throw is fixed when you load: going back
        doesn't throw again.
      </li>
      <li>
        The pen${touch ? nothing : html` (or <kbd>N</kbd>)`} leaves the writer a
        note on the exact moment you're at.
      </li>
    </ul>
    ${touch
      ? nothing
      : html`<p class="mb-help-p small">
          <kbd>Space</kbd> read on · <kbd>1</kbd>–<kbd>9</kbd> choose ·
          <kbd>Tab</kbd> show marks · <kbd>C</kbd> his skills · <kbd>N</kbd> a
          note · <kbd>H</kbd> this page · <kbd>Esc</kbd> the menu
        </p>`}`;
}
