# Mr. Based

A story game in chapters, written as it's played. Only the owner's account can
play it for now; everyone else sees Coming Soon at `/based` and on the Derp
Land home. Access is a mark on the account (`derpy_accounts.based_access`), so
it stays through a change of username and nobody gets it by renaming to
"Alden". `BASED_PLAYERS=Alden,Someone` on the server names accounts to mark:
each name marks the account holding it once (at the next start, or when it
signs up), and is never read again.

## Where things are

| Path                             | What                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `story/chapter-NN.story`         | One file per chapter, in the format below. **Server only.**                        |
| `places/<key>.json`              | The 3D places (the rue de Grenelle and Le Vauban, the Élysée). **Server only.**    |
| `models/*.glb`                   | The CC0 mannequins and furniture, compressed. **Server only.**                     |
| `art/*.webp`, `art/credits.json` | The graded pictures (portraits, memories, the photograph) and who made everything. |
| `audio/*.mp3`                    | Ambient loops.                                                                     |
| `engine/`                        | Parser, runtime, dice and skills, nav grid, validator, flowchart shape, saves.     |
| `client/`                        | The page at `/based`: Coming Soon, title, setup, the player, the flowchart.        |
| `client/world/`                  | The 3D world: the kit places are built from, the people, rain, the look.           |
| `src/server/derpy/DerpyBased.ts` | The API at `/derpy/api/based`, and who may play.                                   |
| `scripts/based-notes.ts`         | Prints the notes Alden leaves for the writer.                                      |

The story, the places, the models, the pictures and the sound are never
bundled into the site's JavaScript. The server reads them from this folder and sends them only to an
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

## How it plays (r21)

Like Disco Elysium: the place in 3D, seen from above at an angle, where he
walks where you click (tap on a phone), and the dialogue column on the right
(a bottom sheet on a phone) where the story scrolls up. Before chapter one
you choose what he was at the Agency (an archetype, or your own share of the
points). His skills speak up in the column when they're good enough, every
check shows its dice, and the walls between the camera and the room he's in
come down. Press Tab (or the eye) to mark everything he can look at, C for
his skills, N for a note to the writer.

## The script format

Plain text. One thing per line; indentation is for the reader only (blocks
close with `end`). `//` starts a comment line, and after a space it can end
one too: `A line.   // r21: new`.

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
  forward too, and so do his build and boosts.)
- `@cast ... look=suit_charcoal`: how they're dressed in 3D (the looks are in
  `client/world/People.ts`: suit_charcoal, overcoat_charcoal, suit_grey,
  barman, wool_woman, coat_dark, suit_dark, uniform_navy). `body=STRANGER`
  says this name is the same person as another cast member (Delorme is the
  man in grey), so speaking moves that body.

### Skills (r21)

```
@attribute WITS "Wits" "The trained mind: files, faces, languages, the craft."
@skill MEMORY WITS "Memory" "Faces, files, names and dates."
@archetype ANALYST "The Analyst" WITS=4 NERVE=2 HEART=3 signature=MEMORY "What he was."
@points 9 min=1 max=5
```

- Each skill starts at its attribute's value; the signature skill is one
  higher. The setup screen offers the archetypes, or `@points` to share out.
- `boost SKILL +1 "Why"` raises a skill for the rest of the game (the
  memories do this); it shows as a reminder and on his sheet.
- Conditions can read skills: `if skill.composure >= 4`.

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

### Checks (r21)

Two six-sided dice plus the skill (and any bonuses) against a difficulty.
Double six always succeeds, double one always fails. Difficulties are a
number or a name: trivial 6, easy 8, medium 9, challenging 10, formidable 11,
legendary 12, heroic 13, godly 14, impossible 15. The column shows them as
`[Composure – Challenging 10] 58%`.

```
choose "He's waiting."
  * white MENACE challenging if came_down [Call him out] "Say it."
    bonus +2 if came_down "He came down from upstairs"
    He blinked first.
    set called_out
  fail
    He didn't blink.
  * [Something else]
end
```

- `white` checks can be tried again once something changes (a bonus starts
  to apply, or the skill rises); until then they show as locked. `red`
  checks are one try only. A passed check is gone.
- `bonus +N [if condition] "Why"` lines go anywhere in the option.
- The lines after the option are what happens on a success; after `fail`,
  what happens on a failure (leave it out and a failure just carries on).
- A check option can't jump straight off with `->`; put the jump in its text.
- Every choice still needs one option with no `if`, `once` or check.

### Voices (r21)

```
~ TRADECRAFT: Twenty minutes with an unlit cigarette.     // always heard
~ INSTINCT medium: Three exits, and the staff door.       // a passive check
```

A thought can belong to a skill. With a difficulty it's a passive check
(skill + 6 against it): only a skilled enough Mr. Based hears it.

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

In a 3D place (r21), spots are the place's hotspots, and he walks to them:

```
investigate "Read the room" min=3 leave="That'll do"
  spot room_mirror "The mirror behind the bottles"
  spot ring "His left hand" at=ring
  deduce expected "Someone was expecting him" needs=door,coats skill=TRADECRAFT diff=medium
    Nobody else had come in out of the rain...
  fail
    It adds up to something. Not yet.
end
```

- `spot id "Label" [at=hotspot]`: the place's hotspot (by default the
  spot's own id). Spots with X and Y are still looked at on a flat picture
  (the photograph), held up close over the world.
- `investigate ... still`: he stays put and looks (reading a man beside
  him); `exit=hotspot`: walking to that hotspot (a door) also leaves.
- `deduce ... skill=SKILL diff=D`: his skill works it out. If it's good
  enough (skill + 6 against D) it speaks up at once; otherwise it's a white
  check, one easier for each other thing he's noticed in the room. `bonus`
  and `fail` work as in choices.

### Places and people (r21)

```
@place grenelle                    // the 3D place (places/grenelle.json), or none
@actor ANSELME behind_bar lean     // someone at a mark, in a pose (stand, sit, lean, fold)
@actor BASED stool_end sit walk    // ...walking there first
@actor BASED vauban_door_out walk wear=overcoat_charcoal
@actor STRANGER none               // off the stage
@focus glasses                     // hold a camera shot, or none to follow him
@vignette london                   // a memory, painted at the top of the column
@show card                         // the place's props the story shows or hides
@hide card
@gesture BASED drink               // drink, pick_up, interact, nod, shake
```

The validator checks every mark, hotspot, shot and prop against the place
each scene is in.

### The places (r21)

`places/<key>.json` lists a place's pieces (floors, walls with windows and
doors, the bar, the back bar, lamps, façades, signs, posters, furniture from
`models/props.glb`...), its lights, the marks people stand at, the hotspots
he can look at (on someone: `"on": {"who": "STRANGER", "bone": "hand_l"}`),
camera shots, rooms (`inside` rooms have their near walls cut away while
he's in them) and the floor plan for walking (`nav`). Words on signs and
posters live here, not in the code. Distances are in metres.

A few switches worth knowing: a window in a wall can leave out the café
curtain (`"cafe": false`, as in the palace); a `skyline` (the city seen through
a window) takes `horizon`, `tower` and `towerAt`, where its roofs, the tip of
the tower and the tower stand, as shares of its height and width. The camera
has no perspective, so a city "far off" is painted at the size it should
look, not the size it is.

### Art and sound

Pictures go in `art/` as WebP (≤ 250 KB, graded to match: cool shadows, amber
highlights), backdrops 1600×900, portraits 720×900, and every one is listed in
`art/credits.json` with its author, licence and source. So is every model in
`models/` (CC0: Quaternius' mannequins and animations, Kenney's furniture
and cars), compressed with meshopt and under 300 KB each. Only CC0, public
domain, CC BY or CC BY-SA (credited), or the Unsplash or Pexels licence. Never
a real public figure, and never a real person's face for a villain or a
politician: those are shown from behind, in shadow or in silhouette. Every
character and the government in the story are invented.
