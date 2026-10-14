// Mr. Based's "How to play" (r21): walking, looking, the column, his skills
// and the checks. r22: finding things by walking about, running, doors,
// reading a room from a seat, thoughts, languages, the journal and saves. The skills' names come from the chapter (they're the
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
      Walk him round Paris, look at things, talk to people. Nobody tells you
      what's there: you find it. His skills do the rest: they notice, they speak
      up, and when it matters he rolls the dice.
    </p>

    <div class="mb-panel-sub">Walking and finding things</div>
    <ul class="mb-help">
      <li>
        ${click} the floor and he walks there;
        ${touch ? "tap twice" : "double-click"} and he
        runs.${touch
          ? nothing
          : html` The mouse wheel moves the camera in and out.`}
      </li>
      <li>
        What's worth a look glints when he's near enough to see it. The better
        his Perception, the further off he notices things. ${click} something
        he's noticed and he goes over and looks.
      </li>
      <li>
        ${touch
          ? html`The eye shows the names of what's near him.`
          : html`Hold <kbd>Tab</kbd> (or turn on the eye) to see the names of
              what's near him.`}
        Only what he could see from where he stands; never the whole place.
      </li>
      <li>
        ${click} a person to go up and talk. What they say depends on what
        you've done.
      </li>
      <li>
        Doors lead to other places: the street, the bar, the hotel. Going
        through one takes a moment's fade.
      </li>
      <li>
        Sitting down, he reads the room from his seat:
        ${touch ? "drag" : html`drag, or use the arrow keys,`} to look about,
        and ${click.toLowerCase()} what he can see to look at it without getting
        up.
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
      <li>
        When things add up, a thought comes to him and waits in the column:
        ${click.toLowerCase()} it to think it through.
      </li>
      <li>
        Someone speaking a language he doesn't know shows as they said it. Point
        at the language's name to see what he made of it.
      </li>
    </ul>

    <div class="mb-panel-sub">His journal</div>
    <ul class="mb-help">
      <li>
        The book${touch ? nothing : html` (or <kbd>J</kbd>)`} keeps what he's
        set out to do: only what he's learned, never a list of what's where.
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
      higher. Some memories raise a skill for good. Your skills (the figure at
      the top${touch ? nothing : html`, or <kbd>C</kbd>`}) show where he stands.
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
        Reading a room or a man, what it adds up to comes to him by itself when
        he's noticed what it needs and the skill is good enough. If not, it
        waits in the column as a white check, one easier for every other thing
        he has noticed there.
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
        The game saves by itself as he goes (the
        autosave).${touch
          ? nothing
          : html` <kbd>F5</kbd> quicksaves and <kbd>F9</kbd> loads the
              quicksave.`}
        The menu saves to ten slots of your own and loads any of them. Saving in
        the middle of a conversation keeps its start. A throw is fixed when you
        load: going back doesn't throw again.
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
          <kbd>Tab</kbd> what's near · <kbd>C</kbd> your skills ·
          <kbd>J</kbd> journal · <kbd>F5</kbd> quicksave ·
          <kbd>F9</kbd> quickload · <kbd>N</kbd> a note · <kbd>H</kbd> this page
          · <kbd>Esc</kbd> the menu
        </p>`}`;
}
