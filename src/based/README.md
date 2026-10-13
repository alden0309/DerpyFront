# Mr. Based

A story game in chapters, written as it's played. Only the account `Alden` can
play it for now (set `BASED_PLAYERS=Alden,Someone` on the server to add
people); everyone else sees Coming Soon at `/based` and on the Derp Land home.

## Where things are

| Path                             | What                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `story/chapter-NN.story`         | One file per chapter, in the format below. **Server only.**                          |
| `art/*.webp`, `art/credits.json` | The graded pictures (1600×900 backdrops, 720×900 portraits) and who made them.       |
| `audio/*.mp3`                    | Ambient loops.                                                                       |
| `engine/`                        | Parser (`Script.ts`), runtime (`Runtime.ts`), validator, flowchart shape, saves.     |
| `client/`                        | The page at `/based`: Coming Soon, title, chapter select, the player, the flowchart. |
| `src/server/derpy/DerpyBased.ts` | The API at `/derpy/api/based`, and who may play.                                     |
| `scripts/based-notes.ts`         | Prints the notes Alden leaves for the writer.                                        |

The story, the pictures and the sound are never bundled into the site's
JavaScript. The server reads them from this folder and sends them only to an
account that may play (`tests/based/BasedBundle.test.ts` checks the bundle;
`tests/server/BasedApi.test.ts` checks the gate). A chapter file is re-read
when it changes, so an edit shows up on the next load without a restart.

## Working on a chapter

1. Edit `story/chapter-NN.story`.
2. `npx vitest tests/based --run` checks every chapter: it parses, every jump
   lands, no scene runs off its end, every flag that's read is set somewhere,
   every scene can be reached, the chapter can be finished, every picture
   exists and is credited. It also plays each chapter down 200 random paths.
3. Read Alden's notes: `DATABASE_URL=… npx tsx scripts/based-notes.ts`
   (`--chapter 1`, `--since 2026-10-01`, `--last 5`, `--json`). Each note
   comes with its scene, the line that was on screen and the choices that led
   there.

If a chapter has mistakes while it's being edited, the game shows Alden the
list instead of the chapter.

## The script format

Plain text. One thing per line; indentation is for the reader only (blocks
close with `end`). `//` starts a comment line.

### The header

```
@chapter 1 "The First Glass"
@summary "One line for chapter select."
@start open                      // the first scene (default: the first written)
@cast BASED "Mr. Based" portrait=based_portrait
@cast ANSELME "Anselme" portrait=anselme
@carry "You kept Delorme's card." if took_card
```

- `@cast ID "Name" [portrait=art_key]`: everyone who speaks. The **first**
  cast member is the protagonist: spoken option lines are his.
- `@carry "text" [if condition]`: what the end-of-chapter screen says the
  player takes into the next chapter. (All flags and relationships carry
  forward too.)

### Scenes

```
== anselme "Anselme"            // id (lower_case) and the label shown
@checkpoint "The bartender"      // replayable from chapter select
@backdrop bar_wide               // full-screen picture (art key), crossfades
@figure ANSELME                  // framed portrait on screen (or none)
@ambient rain_in                 // looping sound (or none)
@news "Text for the TV crawl"    // a news ticker (or @news none)
@card "PARIS" "Eleven days after the election"   // a title card
```

A scene must end every path with `-> scene_id` or `-> END` (the end of the
chapter). A save is taken as each scene begins, so keep scenes short enough
that starting one over isn't a chore, and a save still loads after the scene
it's in has been rewritten.

### Lines

```
It had rained every day since the results.        // narration
ANSELME: Monsieur Based.                          // speech
ANSELME (lightly): Nobody in Paris voted for him.  // speech with a manner
~ Everybody keeps their word. It's just never the one you heard.  // his thoughts
He said the name the French way, *Bah-ZAY*.       // *stars* for emphasis
```

Each line is one tap; it types in.

### Choices

```
choose "Anselme waits, cloth in hand." timer=10
  * [It might] "It might. I haven't decided."
    ANSELME: Then I will not ask for it back.
    rel ANSELME +1
  * if asked_politics [Ask again] -> politics
  * once [Think about the rain] -> t_rain
  * silent [Say nothing]
    He let the silence answer.
end
```

- `* [Label]` is what the button says; an optional `"line"` after it is what
  he says when it's picked; an optional `-> scene` jumps straight there.
  Otherwise the indented lines below are what happens, and the story carries
  on after `end`.
- `timer=N` gives N seconds to answer (the player can turn timers off). When
  the time runs out the `silent` option is taken (or the first, if there's
  none): silence is a choice.
- `once` options disappear after they're taken (for a menu you loop back to).
- `if condition` options only appear when the condition holds.
- An option's id is its label in lower-case-with-dashes; give it a fixed one
  with `{id}` after the label if you want to rename the label later without
  losing the flowchart history: `* [It might] {it-might} "..."`.
- Every choice needs at least one option with no `if` and no `once`.

### Flags, relationships, memory

```
set tv_off            // a flag (1)
set count = 3
add thoughts 1        // a counter
unset tv_off
rel ANSELME +1        // relationship; shown as "Anselme warms to you."
remember PENHALLOW    // shows "Penhallow will remember that."
```

### Conditions

```
if knows_oak
  ~ An oak leaf on the inside of the lapel.
elif rel.anselme >= 2 and not tv_off
  ...
else
  ...
end
```

Flags are read as numbers (unset is 0); `rel.name` is a relationship.
`and`, `or`, `not`, parentheses, `>= <= > < == !=`.

### Investigations (reading a room or a person)

```
investigate "Read the man in grey" min=3 leave="Enough"
  spot umbrella 12 80 "His umbrella"
    A black umbrella hooked on the brass rail. Bone dry.
  spot shoes 36 93 "His shoes"
    Black Derbys on thick rubber soles.
  deduce came_down "He was already in the building" needs=umbrella,shoes
    He hadn't come in out of the rain.
end
```

- `spot id X Y "Label"`: a hotspot at X% across and Y% down the current
  backdrop. Looking at it sets the flag `id` and plays its lines.
- `deduce id "Label" needs=a,b`: a conclusion that becomes available once
  the spots (or deductions) it needs have been found. Making it sets `id`.
- `min=N` spots must be looked at before `leave` lets him move on.
- A spot's lines can set flags and use `if`, but can't jump elsewhere.

### Art and sound

Pictures go in `art/` as WebP (≤ 250 KB, graded to match: cool shadows, amber
highlights), backdrops 1600×900, portraits 720×900, and every one is listed in
`art/credits.json` with its author, licence and source. Only CC0, public
domain, CC BY or CC BY-SA (credited), or the Unsplash or Pexels licence. Never
a real public figure, and never a real person's face for a villain or a
politician: those are shown from behind, in shadow or in silhouette. Every
character and the government in the story are invented.
