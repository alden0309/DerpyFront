# Mr. Based

A story game in an open world, written as it's played. Only the owner's account can
play it for now; everyone else sees Coming Soon at `/based` and on the Derp
Land home. Access is a mark on the account (`derpy_accounts.based_access`), so
it stays through a change of username and nobody gets it by renaming to
"Alden". `BASED_PLAYERS=Alden,Someone` on the server names accounts to mark:
each name marks the account holding it once (at the next start, or when it
signs up), and is never read again.

## Where things are

| Path                             | What                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| `story/chapter-NN.story`         | One file per chapter, in the format below. **Server only.**                                         |
| `places/<key>.json`              | The 3D places: the street, Le Vauban (bar and lobby), the Élysée. **Server only.**                  |
| `models/*.glb`                   | The people (the owner's own models and CC0 bodies), their clips and the furniture. **Server only.** |
| `art/*.webp`, `art/credits.json` | The graded pictures (portraits, memories, the photograph) and who made everything.                  |
| `audio/*.mp3`                    | Ambient loops.                                                                                      |
| `engine/`                        | Parser, runtime, dice and skills, nav grid, validator, flowchart, saves, weather.                   |
| `client/`                        | The page at `/based`: Coming Soon, title, setup, the player, the flowchart.                         |
| `client/world/`                  | The 3D world: the kit places are built from, the people, the weather, the look.                     |
| `client/world/PeopleHooks.ts`    | What the world asks of a person: getting wet, running (People.ts implements them).                  |
| `src/server/derpy/DerpyBased.ts` | The API at `/derpy/api/based`, and who may play.                                                    |
| `scripts/based-notes.ts`         | Prints the notes Alden leaves for the writer.                                                       |

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

## How it plays (r22)

Like Disco Elysium: the place in 3D, seen from above at an angle, where he
walks where you click (tap on a phone) and runs where you double-click, and
the dialogue column on the right (a bottom sheet on a phone) where the story
scrolls up. Before the story you choose what he was at the Agency (an
archetype, or your own share of the points) and which languages he speaks.

After a short opening he's free: the story waits for the player to start
something. Nothing lists what's in a place. What's worth a look glints when
he's near enough to see it (his Perception widens how near); Tab (or the eye)
names only what's near him and in sight. Clicking a person walks him up to
them and they talk; clicking a thing he's noticed walks him over and he
looks. Doors lead to other places, each its own area: a short fade and the
place's name. Seated, he reads the room from his seat (drag or the arrow
keys to look about, click what he can see). Thoughts that come to him wait
in the column. The journal (J) keeps what he's set out to do, only as he
learns it. It rains, drizzles, clears and fogs; puddles spread and dry,
the stone darkens when wet, people caught in the rain get wet and dry
indoors.

C for your skills, J the journal, N a note to the writer, F5 quicksave, F9
quickload, Esc the menu (save and load slots).

## Saves (r22)

No chapters to pick and no checkpoints: the game saves in **slots**, an
autosave (kept by the game: as each scene begins, when he's free again,
after each door, and every couple of minutes), a quicksave (F5, loaded with F9) and ten of the
player's own (the menu). Each slot lists the place, the time in the story,
when it was saved and how long had been played. They live on the server
with the account, one row each (`derpy_based_slots`), beside a profile
(`derpy_based_saves`: what's been seen, for the flowchart, and time played).
A save holds the story's state at the start of the scene he's in, or, while
he's free, as it is, plus where he stood and how wet he was; only the latest
300 steps of the path are kept, so a save stays a few kilobytes however long
the game. A round-21 save (one per account, chapters and checkpoints) is
turned into an autosave of the rewritten chapter one the first time it's
read: at its start, or, if it was past the meeting with London's contact,
where the world opens after it. Its old flowchart is dropped.

## Why it was laggy, and what changed (r22)

The street and the bar were drawn as one scene, all the time: about 580
things to draw (660 with shadows), 190,000 triangles and 22 real lights (17
lamps and bulbs, 5 spotlights) that every surface worked out, plus two
shadows, a Kuwahara paint filter, bloom and 4× multisampling at up to twice
the screen's pixels. The TV redrew its picture and sent it to the graphics
card every frame, and the column re-drew itself every frame while text
typed in. Now each place is its own scene (only the one he's in is drawn),
a place keeps to 8 real lights on a laptop and 4 on a phone (the street
lamps share a pool of 4 lent to the nearest), one shadow drawn every other
frame, the picture's resolution is capped at 1.5× and falls when the device
can't keep up, the TV redraws 12 times a second, and the column only redraws
what changes. The building on the right flickered because the lit windows
were painted exactly level with the dark glass behind them: as the camera
moved, the two fought pixel by pixel and the windows flashed. They no longer
touch, and from inside the bar that building isn't drawn at all.

## The script format

Plain text. One thing per line; indentation is for the reader only (blocks
close with `end`). `//` starts a comment line, and after a space it can end
one too: `A line.   // r21: new`.

### The header

```
@chapter 1 "The First Glass"
@summary "One line for chapter select."
@start open                      // the first scene (default: the first written)
@time 21:40                      // the clock when it starts (r22)
@cast BASED "Mr. Based" portrait=based_portrait
@cast ANSELME "Anselme" portrait=anselme
@carry "You kept Delorme's card." if took_card
@language fr "French"            // a language he can be given (r22)
```

- `@cast ID "Name" [portrait=art_key]`: everyone who speaks. The **first**
  cast member is the protagonist: spoken option lines are his.
- `@carry "text" [if condition]`: what the end-of-chapter screen says the
  player takes into the next chapter. (All flags and relationships carry
  forward too, and so do his build and boosts.)
- `@cast ... look=suit_charcoal`: how they're dressed in 3D (the looks are in
  `client/world/People.ts`: suit_charcoal, overcoat_charcoal, suit_grey,
  barman, wool_woman, coat_dark, suit_dark, uniform_navy). Mr. Based is
  `look=field_jacket`: he wears what the owner's own model wears (a black
  zip field jacket over an olive tee, cargo trousers, boots, a watch), one
  mesh, so nothing comes off: no coat to hang up, and the story never
  dresses him in a suit or an overcoat. `body=STRANGER`
  says this name is the same person as another cast member (Delorme is the
  man in grey), so speaking moves that body.

### Skills (r21, r22)

```
@attribute INTELLIGENCE "Intelligence" "The trained mind: files, faces, tongues, the craft."
@skill MEMORY INTELLIGENCE "Memory" "Faces, files, names and dates."
@archetype ANALYST "The Analyst" SOCIAL=2 INTELLIGENCE=4 PHYSICAL=3 signature=MEMORY "What he was."
@points 9 min=1 max=5
```

Three attributes of four skills each: Social (Charisma, Intimidation,
Empathy, Deception), Intelligence (Memory, Instinct, Languages, Focus) and
Physical (Strength, Endurance, Dexterity, Perception). Perception widens how
far off he notices things; Languages decides how many of the `@language`s
he speaks (one at Languages 2 or less, then one more a point) and how well.

- Each skill starts at its attribute's value; the signature skill is one
  higher. The setup screen offers the archetypes, or `@points` to share out.
- `boost SKILL +1 "Why"` raises a skill for the rest of the game (the
  memories do this); it shows as a reminder and on his sheet.
- Conditions can read skills: `if skill.focus >= 4`; and languages:
  `if speaks.fr`.

### Scenes

```
== anselme "Anselme"            // id (lower_case) and the label shown
@backdrop bar_wide               // full-screen picture (art key), crossfades
@figure ANSELME                  // framed portrait on screen (or none)
@ambient rain_in                 // looping sound (or none)
@news "Text for the TV crawl"    // a news ticker (or @news none)
@card "PARIS" "Eleven days after the election"   // a title card
```

A scene must end every path with `-> scene_id`, `-> FREE` (he's free to go
where he likes: see the open world below) or `-> END` (the end of the
chapter). A save in the middle of a scene starts it over, so keep scenes
short enough that starting one over isn't a chore; a save still loads after
the scene it's in has been rewritten.

### The open world (r22)

```
== posters "The posters"
@on look posters once            // the first look at the posters
...
-> FREE

== posters_again "The posters"
@on look posters                 // every look after
...
-> FREE

== order "The barman"
@on talk BARMAN once             // going up to him the first time
== watcher "The man under the awning"
@on talk WATCHER if met_contact and not watcher_gone
== vauban "Le Vauban"
@on enter vauban once            // walking into a place
== idea "Who was he watching?"
@on think "Who was the man in grey watching?" if corner and delorme_gone
== later "Later"
@on auto if knows_car            // starts by itself, as soon as it's true
```

- `@on` goes at the top of a scene and says what starts it once he's free:
  `talk WHO` (clicking that person; either of their names), `look THING` (a
  hotspot of the place he's in; `in=place` to say which), `enter PLACE`,
  `think "Label"` (a thought that waits in the column until clicked) or
  `auto`. Then `once`, `in=place` and `if condition`. Think and auto scenes
  play once.
- Each person and thing answers with the **first** scene, in the order
  they're written, whose condition holds: put the particular ones first and
  a plain one (no `if`, no `once`) last, so people always have something to
  say.
- `-> FREE` ends a scene and hands him back to the player. Something must
  lead to `-> END` from the open world (the validator checks).
- A door is a hotspot with `"to"` in the place's data; an `@on look` scene
  on a door can stop him going through.

```
task contact "Meet London's contact at Le Vauban at ten."   // his journal
task contact done
@weather rain                    // rain, drizzle, clear, fog, changing, none
@time 23:15                      // the clock (earlier than now: next day)
@actor BARMAN behind_bar lean in=vauban   // someone in another place
WOMAN [fr]: Bonsoir. | Good evening.      // in another language
DELORME [fr medium]: L'Américain. | The American.   // gist with Languages
```

A line in another language shows its meaning if he speaks the language,
and the words as said if he doesn't; with a difficulty, his Languages skill
(plus six) can get the gist without it (a speaker gets two more). The clock
moves twenty seconds a line and ten a choice.

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
  him, or the room from his seat); `exit=hotspot`: walking to that hotspot
  (a door) also leaves. In 3D nothing is listed: the spots glint as he
  notices them, and what they add up to waits in the column.
- `deduce ... skill=SKILL diff=D`: his skill works it out. If it's good
  enough (skill + 6 against D) it speaks up at once; otherwise it's a white
  check, one easier for each other thing he's noticed in the room. `bonus`
  and `fail` work as in choices.

### Places and people (r21, r22)

```
@place grenelle                    // the 3D place (places/grenelle.json), or none
@actor ANSELME behind_bar lean     // someone at a mark, in a pose (stand, sit, lean, fold)
@actor ANSELME behind_bar in=vauban // r22: at a mark in another place
@actor BASED stool_end sit walk    // ...walking there first
@actor ANSELME behind_bar wear=suit_dark // a change of clothes
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

r22: each place is an area of its own: only the one he's in is drawn, and
the places its doors lead to are built in the background, so going
through a door is a short fade. A hotspot with `"to": {"place": "vauban",
"mark": "vauban_door_in"}` is a door; `"label"` names it (or anything) on
screen; `"near"` is how many metres off it's noticed before his Perception
widens it (2.5 by default; doors 7). `"outdoor": true` puts the weather on
a place. Each place keeps to a budget of real lights (8 on a computer, 4 on
a phone): give a light `"prio"` (3 the most) in the data, or the kit ranks
its pieces (a lamp's bulb over a back bar's glow); the street lamps share
four real lights lent to the nearest, and one light keeps its shadow.

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
`models/` (CC0: Quaternius' base characters and animations, Kenney's
furniture and cars), compressed with meshopt and under 400 KB each (a
character's own model, up to 1 MB: see People and models). Only CC0, public
domain, CC BY or CC BY-SA (credited), or the Unsplash or Pexels licence. Never
a real public figure, and never a real person's face for a villain or a
politician: those are shown from behind, in shadow or in silhouette. Every
character and the government in the story are invented.

## People and models (r22)

Everyone in the 3D places is one of two bodies, a man and a woman
(Quaternius' CC0 _Universal Base Characters_: a sculpted face, eyes, brows
and modelled hair), dressed in code. Their clothes are cut from the body
when a place loads: a jacket is the body's own surface, cut along its
edges (the cuffs, the hem, the V of the lapels), smoothed and pushed out by
the cloth's thickness, so it moves exactly with him; a coat's skirts, a
skirt and an apron hang from the hips; lapels, collars, ties, buttons, hats
and glasses are made on top. Whatever a layer covers is left out, so each
person is **one mesh with one material** (about 8,000 to 10,000
triangles). The code is in `client/world/People.ts` and
`client/world/people/` (`Looks.ts`, `Tailor.ts`, `Retarget.ts`).

### Looks

A look is a short description in `client/world/people/Looks.ts`. Change a
colour, a haircut or a hat there and the next load shows it; nothing has
to be remodelled. The story names looks with `@cast ... look=` and changes
clothes with `@actor ... wear=`.

| Look                | Who                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `field_jacket`      | Mr. Based: **the owner's model** (`mr_based`); its stand-in: black zip field jacket worn open, olive tee, black cargo trousers, boots |
| `suit_charcoal`     | Mr. Based in r21: charcoal suit, white shirt, dark red tie (also drawn as his model)                                                  |
| `overcoat_charcoal` | The same in the street: an overcoat (collar up) and a scarf (also drawn as his model)                                                 |
| `suit_grey`         | Delorme, the man in grey: younger, slicked hair, a narrow tie                                                                         |
| `barman`            | Anselme: **the owner's model** (`bartender`); its stand-in: sixties, white moustache, black waistcoat, long apron                     |
| `wool_woman`        | Penhallow: grey wool jacket and skirt, glasses, hair pinned up                                                                        |
| `coat_dark`         | The man under the awning: dark trench coat, fedora, a cigarette                                                                       |
| `suit_dark`         | The President: dark suit                                                                                                              |
| `uniform_navy`      | The Colonel: navy uniform, gold buttons and boards, peaked cap                                                                        |
| `trench_tan`        | A man in a tan trench coat and trilby                                                                                                 |
| `old_beret`         | An old man: beret, beard, cardigan                                                                                                    |
| `worker_blue`       | A worker: blue jersey, flat cap                                                                                                       |
| `waiter`            | A waiter: white jacket, black tie                                                                                                     |
| `police`            | A policeman: navy, peaked cap                                                                                                         |
| `coat_red`          | A woman in a red coat, a bob                                                                                                          |
| `suit_black_f`      | A woman in a black suit, long hair                                                                                                    |
| `sweater_grey`      | A clerk: grey sweater, glasses                                                                                                        |

What a look can say:

- `body`: `"m"` or `"f"`; `height` (1 is about 1.8 m for a man);
  `build` from -1 (slight) to 1 (heavy).
- `skin`, `hair` (colours), `hairStyle` (`parted`, `slick`, `receding`,
  `buzzed`, `bald` for men; `long`, `bob`, `buns`, `cropped` for women),
  `grey` (0 to 1: grey at the temples and through the hair), `facial`
  (`stubble`, `moustache`, `beard`).
- `face`: `jaw`, `nose`, `brow`, `cheeks`, `age`, each from -1 to 1 (a
  broader jaw, a longer nose, a heavier brow, fuller cheeks, older skin).
- Clothes: `shirt`, `tie`, `jacket` with `cut` (`single`, `double`,
  `closed`, `zip`: a field jacket to the hip, worn open, with a stand
  collar), `waistcoat`, `sweater`, `coat` with `coatCut` (`overcoat`,
  `trench`) and `collarUp`, `scarf`, `trousers` or `skirt` with `legs`
  (stockings), `shoes`, `apron`, `braid` (gold buttons and shoulder
  boards), `hat` (`fedora`, `trilby`, `cap`, `flatcap`, `beret`, with a
  colour and a band), `glasses` (`round` or `square`), `cigarette`.
- `model`: a model in `models/` that replaces all of the above once it has
  loaded (the rest is its stand-in until then, and if it can't be used).
  Whoever is cast in a look with a model keeps that model in every `wear=`.

A picture works as a reference for a look: send it, and the look's colours,
haircut, face and clothes can be set to match. Never a real person's
likeness.

### Your own model for a character

The best result from a picture is a 3D model made from it with an
image-to-3D tool that rigs what it makes (Meshy, Tripo, or similar), or a
model rigged on Mixamo. The game then plays its own animations on that
model (walking, running, sitting, leaning, talking, drinking, nodding);
any animations in the file are ignored.

1. **Make the model.** Make a humanoid in a T-pose or an A-pose, about
   10,000 to 30,000 triangles, one or two materials, facing the camera.
   Rig it as a humanoid: in Meshy, use _Rigging_ (biped); in Tripo,
   _Auto Rig_; or upload it to Mixamo. Export **GLB** (binary glTF) with
   the skin (the skeleton and its weights). Animations, morphs and
   cameras are not needed.
2. **Make it small.** The game takes a hero's model up to **1 MB** and
   anyone else's up to **400 KB**. From the repository folder, one
   command shrinks a GLB (it quantises the mesh, compresses it with
   meshopt and turns the textures into 1024 px WebP):

   ```
   npx @gltf-transform/cli@4 optimize mine.glb src/based/models/based.glb \
     --compress meshopt --texture-compress webp --texture-size 1024
   ```

   Still too big? Add `--texture-size 512`, or
   `--simplify true --simplify-ratio 0.5`.

3. **Put it in `src/based/models/`.** Its name (without `.glb`) is its
   key: lower case, digits and `_` only (`based.glb` is `based`).
4. **Give it to a character** in the chapter's header:

   ```
   @cast BASED "Mr. Based" portrait=based_portrait look=suit_charcoal model=based
   ```

   The look stays as a stand-in while the model loads (and if it can't be
   used); `wear=` changes nothing for someone with their own model. A look
   can also name the model itself (`model:` in `Looks.ts`, as
   `field_jacket` and `barman` do).

5. **Credit it** in `art/credits.json` (the tests insist): who made it, the
   licence (`Own work` for the owner's own), and where it came from.
6. **Check it**: `npx vitest tests/based --run` tests its size, its
   compression and its credit; then play the scene.

The game finds the bones by name, so Quaternius, Mixamo (with or without
`mixamorig:`), Meshy and Tripo, VRM, Rigify and 3ds Max Biped skeletons all
work: hips, spine (two to four bones), neck, head, both shoulders, arms,
forearms, hands, thighs, shins, feet and toes. It needs at least the hips,
a spine, the head, both arms and forearms, both thighs and shins; without
them the console says which bones are missing and the look is used instead.
It is scaled to the height of the base bodies, stood on the floor and turned
to face forward, whatever size and way round it came in.

### The owner's models: Mr. Based and the barman

Two characters wear models the owner supplied, made with an image-to-3D
tool and not rigged: Mr. Based (`mr_based.glb`, worn with `field_jacket`,
`suit_charcoal` or `overcoat_charcoal`) and Anselme the barman
(`bartender.glb`, worn with `barman`). Each came as one mesh of 750,000 to
813,000 triangles with three 2048 px textures (17 MB). For the game each
was:

- **reduced** to 40,000 triangles (meshoptimizer, keeping the UV seams and
  the outline), its textures to 1024 px WebP (the base colour and normals;
  the metal-roughness at 512 px);
- **rigged** onto the game's skeleton (Quaternius' bone names, in the
  model's own A-pose) with no outside tool: the joints are found by slicing
  the mesh (the crotch, knees, ankles, armpits, elbows, wrists, neck), the
  base body is posed to match, and its skin weights are carried over to the
  nearest point of the model's surface, smoothed, with fixes where a jacket's
  hem would follow the thighs, a collar the head or a shoulder the arm;
- given a **wetness mask** (`_WETMASK`, read from its colours): rain soaks
  the cloth and the hair and barely touches the face and hands;
- **compressed** (meshopt): Mr. Based 553 KB, the barman 680 KB, each one
  mesh with one material (one draw call).

Their portraits in the dialogue column (`based_portrait`, `anselme`) are
renders of these models through the game's own post (the noir grade and
the painted Kuwahara filter); the photos they replaced are kept, credited,
as `based_portrait_photo` and `anselme_photo`.

The barman's apron hangs from **cloth bones** (below), and the trousers it
covers were drawn in a little, out of sight, so the legs never show
through it. The scripts that did this were one-offs and are not in the
repository; for a new version of either model, rigging it in Meshy, Tripo
or Mixamo and following the steps above is the simplest way.

**Loose cloth.** A model's apron or long skirts can hang from bones named
`cloth_front` and `cloth_back` (or a half for each leg: `cloth_front_l`,
`cloth_front_r`, `cloth_back_l`, `cloth_back_r`): children of the hips, at
the height of the hip joints, with no animation. Each frame the game swings
a front one forward as far as the leg that is furthest forward (a half: its
own leg, and half as far as the other), less a little slack while
standing, and a back one back with the leg furthest back, so a knee never
comes through. Weight the cloth to them below the hips, and its sides to
the thighs.

### Hooks for the world

On each person, `setWetness(k)` (0 dry to 1 soaked: clothes and hair
darker and glossier, cheaply, on the person's own material; on a model
with a wetness mask, by the mask) and
`setGait("walk" | "run")` (running lasts until they next arrive; walking
is 1.15 m/s, running 2.6 m/s, with the jog clip).

### Where the people come from

| What                                                                            | Source                                             | Licence |
| ------------------------------------------------------------------------------- | -------------------------------------------------- | ------- |
| The bodies, faces, eyes, brows, haircuts and beard (`body_m.glb`, `body_f.glb`) | Quaternius, _Universal Base Characters_ (Standard) | CC0     |
| The clips (`anims.glb`)                                                         | Quaternius, _Universal Animation Library_ 1 and 2  | CC0     |
| Clothes, hats, glasses                                                          | Made in code (`people/Tailor.ts`)                  | ours    |
| Mr. Based (`mr_based.glb`) and the barman (`bartender.glb`)                     | Supplied by the owner (reduced and rigged here)    | his     |

`body_*.glb` were built by merging each body with its haircuts onto one
skeleton, simplifying everything but the face (about 5,300 triangles a
body), and packing every texture into one 1024 × 512 atlas (skin, hair,
eyes, and plain swatches whose roughness makes wool, cotton, silk, leather,
felt or metal), then meshopt. They are 146 KB and 164 KB; the clips 185 KB.
