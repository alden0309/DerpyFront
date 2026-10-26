# Mr. Based

A story game in an open world, written as it's played. Only the owner's account can
play it for now; everyone else sees Coming Soon at `/based` and on the Derp
Land home. Access is a mark on the account (`derpy_accounts.based_access`), so
it stays through a change of username and nobody gets it by renaming to
"Alden". `BASED_PLAYERS=Alden,Someone` on the server names accounts to mark:
each name marks the account holding it once (at the next start, or when it
signs up), and is never read again.

## Where things are

| Path                             | What                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `story/chapter-NN.story`         | One file per chapter, in the format below. **Server only.**                                                  |
| `places/<key>.json`              | The 3D places: the street, Le Vauban (bar and lobby), the Élysée. **Server only.**                           |
| `models/*.glb`                   | The people (the owner's own models and CC0 bodies), their clips and the furniture. **Server only.**          |
| `models/fusion_props.glb`        | r23: the furniture, the street's furniture and the cars, modelled for the game in Fusion.                    |
| `art/*.webp`, `art/credits.json` | The graded pictures (portraits, memories, the photograph) and who made everything.                           |
| `audio/*.mp3`                    | r25: the sound: beds (looped), the score's three cues, and sprites of short sounds (`client/SoundTable.ts`). |
| `places/room.json`               | r25: his room upstairs (room twenty-three), where part one ends.                                             |
| `client/Sound.ts`                | r25: the soundscape (beds, footsteps, doors, effects, the score, the levels).                                |
| `client/world/Furnish.ts`        | r25: the lobby's and the room's pieces (the stairs, the rope, the desk, the guest book, the bed...).         |
| `engine/`                        | Parser, runtime, dice and skills, nav grid, validator, flowchart, saves, weather.                            |
| `engine/Solid.ts`, `Props.ts`    | r23: what's solid in a place (from its pieces) and the props' footprints and seats.                          |
| `engine/Walk.ts`                 | r23: how people move along a path (easing, rounded corners, turning).                                        |
| `client/world/Palette.ts`        | r23: the named materials of the Fusion props.                                                                |
| `client/`                        | The page at `/based`: Coming Soon, title, setup, the player, the flowchart.                                  |
| `client/world/`                  | The 3D world: the kit places are built from, the people, the weather, the look.                              |
| `client/world/PeopleHooks.ts`    | What the world asks of a person: getting wet, running, a look, a prop in hand (r22 BPLAY).                   |
| `client/Inventory.ts`            | What he carries (r22 BPLAY): his figure with the slots, the pockets, an item's details.                      |
| `client/ItemArt.ts`              | The ink drawings of things (`icon=`) and of his figure.                                                      |
| `client/Dossier.ts`              | The story so far, as his dossier.                                                                            |
| `client/fonts/`                  | Spectral and Courier Prime (SIL Open Font Licence, the licences beside them).                                |
| `src/server/derpy/DerpyBased.ts` | The API at `/derpy/api/based`, and who may play.                                                             |
| `scripts/based-notes.ts`         | Prints the notes Alden leaves for the writer.                                                                |

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
   there. r26: or Alden hands them over himself: "Notes for the writer" on
   the title screen (or "Your notes for the writer" in the pause menu) lists
   them, New or Sent; "Copy my notes" puts them on his clipboard as plain
   text to paste into a chat (the same entry per note: chapter, scene title,
   id and script line, when, the line on screen, the choices that led
   there, the note) and marks them sent; "Clear the ones I've sent" deletes
   those. The server writes each entry (`noteEntry` in
   `src/server/derpy/BasedNotes.ts`) through `GET /based/notes/all`, with
   `POST` and `DELETE /based/notes/sent`.

4. r26: read the whole chapter as a script, without playing it:
   `npx tsx scripts/based-script.ts --chapter 1 --out /somewhere/script.html`
   writes one page (it needs nothing else, and works offline): every scene in
   story order, grouped by where it happens (the street, the hotel, the bar,
   wherever he is, his room, the palace window), every line with its
   speaker as the player sees it, every choice and check with its conditions
   in plain words, where each leads, what he's given and pays and learns,
   the pop-ups, and a reference on every line ("S12.7") to write notes
   against. It's made with the engine's own parser, so it says what the game
   does. The flags' plain words live in `scripts/based-script-words.ts`
   (`tests/based/BasedScript.test.ts` fails if a flag has none). It's for
   reading only: it won't write into `static/` or `src/`, and nothing the
   site builds or serves includes it.

If a chapter has mistakes while it's being edited, the game shows Alden the
list instead of the chapter.

## How it plays (r22)

Like Disco Elysium: the place in 3D, seen from above at an angle, where he
walks where you click (tap on a phone) and runs where you double-click, and
the dialogue column on the right (a bottom sheet on a phone) where the story
scrolls up. Before the story you choose what he was at the Agency (an
archetype, or your own share of the points) and spend his Languages skill's
points on what he speaks.

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

r22 BPLAY: he carries things. His clothes (hat, glasses, neck, jacket,
shirt, gloves, trousers, shoes) and whatever's in his hand change his
skills while they're on him; his pockets have no limit; he has euros.
Things are found by looking (a bowl of matches, an umbrella nobody
claimed, a newspaper left on the bar), given or sold by people, or taken.
Some options need something (a light needs a match) and show, shut, until
he has it. (r26: the lost-property box and what it held, and the baton
from the police van, are gone at the owner's word; a save that had any of
them loads without them. The engine still lets a weapon in his hand change
how people read him; chapter one has none.)
The inventory (I, or the bag) shows his figure with the slots around it,
his pockets and what each thing does; click to pick, double-click or drag
to put on and take off, Use for things with a use. The story so far (the
menu) is his dossier: where he's been, who he's met and where things stand,
what he decided and the throws that mattered, what he carries, what's
still open, his memories.

C your skills, I what he carries, J the journal, N a note to the writer,
F5 quicksave, F9 quickload, Esc the menu (save and load slots, the story so
far). The same key closes the panel it opened.

## Part one, as the owner reshaped it (r25)

- **The street.** The man under the awning with an unlit cigarette. With
  matches in his pocket (`has_light`, set wherever he gets
  one), going up to him is Mr. Based offering a light; he wants to be
  alone, and that's the end of it. With nothing to light it, a nod the man
  doesn't return; the offer comes once he has a light. He stays under the
  awning (the mirror, the signal). r26: what the man says is French, so
  what Mr. Based makes of it is his French (with too little, he can ask
  again in English); he stands near the wall at the awning's west end,
  where a click on him never lands on the pharmacy and the awning doesn't
  hide him from the camera.
- **The lobby.** A front desk with the desk clerk behind it and the key
  board behind him; the guest book, turned to the clerk and never read; a
  staircase up the back wall, closed by a red rope with a card (Guests:
  please ask at the desk); the lift, out of order all night, its button
  dead; armchairs, a chandelier, a standard lamp; the doorways to the bar
  and the street. London booked his room to his alias, John Locke, and
  he's early: it isn't made up, so the clerk keeps his key, and since
  the Préfecture's circular the stairs are for guests with one. r26: the
  clerk's call (in French, all of it only at 3 points) is where he can
  overhear forty-one's car at six; the clerk himself never talks about
  another guest, by the house's policy ("Our guests' habits are their
  own, monsieur"), money or not.
- **The bar.** The barman's conversation as it was; then the man in grey
  sits beside him because his is a new face. Then London's contact: he can
  tell her only what he noticed. Two telling things (where the man came
  from, his pin, the signal in the mirror, that he's on duty, his look at
  her table, which counts for two) and they work out that the man was
  watching her and has seen them together, so both must disappear
  (`knew_seen`); with less, or nothing, she remarks that the man is here
  every night, always in the same seat, neither can make anything of it,
  and they part thinking it went all right (`missed_watch`).
- **The end of part one.** He's tired; the street is done for the night;
  the clerk hands over the key and unhooks the rope; up the stairs to room
  twenty-three, and sleep; then the two men smoking at the palace window.
- **The regulars.** Two at the bar, a couple at the window table, a man
  with a book: a line or two each, and lives of their own (`idle=`).
- **His cover (r26, the owner's).** Mr. Based is American (seventeen years
  at the Agency); London hired him because he isn't one of theirs. He is
  **John Locke, in wine, from San Diego, California**, on an American
  passport in that name that London made him, and the room is booked to
  John Locke. What he tells people is that one story, the same to
  everyone: a buyer for a wine importer in San Diego, over for the
  tastings. He gives it to the barman, the man in grey ("[The cover]",
  "[Give him your alias]", or "[Keep it to the trade]" when asked his name;
  his real name is a slip the palace hears about) and the clerk; Penhallow
  tells him to be a wine buyer for a few days. There's no other name and
  no other home (`tests/based/BasedCover.test.ts`).
- **The barman's grandson (r26, as the owner reshaped it).** The barman
  doesn't just say it. While he and Mr. Based watch the television, the
  picture cuts to the young men applauding behind the President and his
  cloth stops: an Empathy check ("[Watch him, not the screen]") shows a
  man searching the faces for one he's afraid to find. Asked, he lets it
  out reluctantly, a few lines at a time: his grandson, nineteen, joined
  their Volunteers (`heard_grandson`); asked about the boy, the pin, worn
  inside his lapel so his grandmother won't see it (`knows_oak`). Without
  the check he doesn't learn it there, and the photograph no longer tells
  him.

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
the game. r22 BPLAY: a save also holds what he carries (pockets, what he
wears and holds, his euros) and what the story so far needs (places, people
and when he met them, memories, who'll remember), a few hundred bytes more.
A save from before he carried anything loads with his starting kit; the
next chapter starts with what he had at the end of the last. r25: a save in
a scene that's since been cut (the walk to the river) loads free, where that
scene began; a save free after London's contact from before this round
takes up the new end the moment he's free (`upgrade_r25`: what they knew,
in the new flags, and his journal's last task); one from before the
regulars finds them in their places (`crowd_r25`). A round-21 save (one per account, chapters and checkpoints) is
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

## The look of it (r22 BPLAY)

Inspired by Disco Elysium's (a tall column over a painted world, skills as
voices, checks shown frankly, paper panels, a journal) but its own, from
Mr. Based's world: Paris at night after a coup by ballot, sodium lamps on
wet slate, and the files of a man who used to keep them.

- **The column is a transcript**: the story's clock in the margin when it
  moves on, names typed ("Anselme:"), the words in Spectral.
- **Places are named on their own signs**: the street on a Paris enamel
  plaque (blue, a white rule, a green frame), indoors on an engraved brass
  plate; the time beside it in sodium.
- **Skills speak in the city's lights**: Social in the pharmacy's green
  cross, Intelligence in carbon-paper violet, Physical in sodium amber
  (`VOICES` in `client/Ui.ts`, with a darker ink of each for paper).
- **Checks are pencil or ink**: a check that can be tried again (white in
  the script) is outlined in dashed pencil; a one-throw check (red) in
  solid violet ink, marked "once". Each shows the skill, the difficulty and
  the odds; point at it for every modifier.
- **A throw comes back as a carbon slip** pinned into the transcript: the
  dice, the sum, every modifier (what he's wearing in carbon blue), and a
  rubber stamp, PASSED or FAILED, in administrative violet. The stamp is
  the one loud thing; it also marks who'll remember, the archetype chosen,
  the dossier's cover.
- **Everything he keeps is on pelure**, the thin grey-green copy paper of
  an office that keeps files: what he carries, his skills (a personnel
  file, each skill with where its points come from), the journal, the
  dossier (in a slate-blue folder), the menu (a contents page), settings
  (boxes to tick), save slots (file cards), how to play, the note for the
  writer (a ruled pad). Their headings are typed on a worn ribbon and
  underlined on the machine.
- **Unknowns are redacted**: the flowchart blacks out what hasn't been
  found.
- Type: Spectral (Production Type) to read (with Cyrillic, for what's said
  in Russian), Courier Prime for what's typed, Special Elite (a worn
  typewriter ribbon) for the forms' headings, and Stardos Stencil for the
  name on the file and the rubber stamps. All bundled in `client/fonts`
  with their licences (SIL Open Font Licence; Special Elite: Apache 2.0) and
  credited. No eyebrow labels and no letter-spaced capitals: what's in
  capitals is a stamp. Nothing borrowed from Disco Elysium: not its layout,
  fonts, check colours, skill art or names.
- On a phone the column is a bottom sheet and the papers fill the screen.
  Reduced motion turns off the stamp, the drift and the crawl. Text that
  types in never moves the layout.

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
far off he notices things; Languages is the pool for his languages (below).

- Each skill starts at its attribute's value; the signature skill is one
  higher. The setup screen offers the archetypes, or `@points` to share out.
- `boost SKILL +1 "Why"` raises a skill for the rest of the game (the
  memories do this); it shows as a reminder and on his sheet.
- Conditions can read skills: `if skill.focus >= 4`; and languages:
  `if speaks.fr`, `if speaks.ru >= 2`.

#### Languages: small points under Languages (r22 BPLAY)

```
@language fr "French"
@language ru "Russian"
```

American English is his own (r26: English (British) is gone, at the
owner's word: he's American). French and Russian take up to six points
between them, the most a Languages skill gives, so none is ever wasted. The rest are bought at the start with **language
points**, a pool equal to his **Languages skill at the start** (its
attribute, plus one if it's his signature; at least one). The player spends
them on the setup screen, under Languages in Intelligence, **0 to 3 per
language**:

| Points | He follows it (r26, the owner's language system)                       |
| ------ | ---------------------------------------------------------------------- |
| 0      | **none**: he sees only the words, marked "French he can't follow"      |
| 1      | **poor**: a poor translation, the gist half right and believably wrong |
| 2      | **decent**: a decent translation                                       |
| 3      | **perfect**: exactly what it means                                     |

So the Analyst (Intelligence 4) has 4 points, the Handler 3 and the Operator
2: one language well, or two at getting by, or a little of everything. Your
own man ranges from 1 (Intelligence 1) to 6 (Intelligence 5 and known for
Languages). The points must all be spent before the game starts (unless
every language is already at 3).

- **Every foreign line** (r26) is shown at his points in its language:
  everything in French or Russian, said to him, overheard, or written (a
  poster, a sign, a notice, the radio, the television's ticker) carries
  what he makes of it at 1, 2 and 3 points, and at 0 he sees only the
  words. There's no gist at 0 and no check: how hard a line is to follow
  (said low, fast, on the telephone) is written into its versions (the
  clerk's call has the car at six at 2 points, and where it goes only at
  3). Whatever depends on having understood it asks for the level it
  needs (`if speaks.fr >= 2`), with a way through for less (the man under
  the awning can be asked again in English).
- **A check in a tongue** names it: `* white LANGUAGES.ru medium [Ask him, in
Russian]`. Its base is his Languages skill, with "His Russian" (his
  rating) as a modifier, and whatever he wears for either; `bonus` lines work
  as on any check. Voices can be in one too: `~ LANGUAGES.fr medium: ...`.
- **Conditions** read the rating: `speaks.fr` (1 or more), `speaks.fr >= 2`
  (decent or better), `speaks.fr >= 3` (perfect).
- **Later points**: `boost LANGUAGES.fr +1 "Lessons with the concierge"`
  adds to one language for good; an item can add while it's worn or held:
  `@item phrasebook "Russian phrasebook" kind=document slot=hand
bonus=LANGUAGES.ru+1 "..."`. His sheet lists each language under Languages
  with its pips and where the points came from.
- **Saves:** BWORLD's saves listed the languages he was given; they load as
  points (one in each language he had, then the rest of his pool round them
  again, up to 3, and what's left over to the others). German is gone from
  chapter one, and r26 English (British): their points go to the languages
  that are left, a point at a time to the one he has least of.

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
WOMAN [fr]: Bonsoir.             // said in another language...
| 1: Good night.                 // ...what he makes of it with 1 point (poor)
| 2: Evening.                    // 2 (decent)
| 3: Good evening.               // 3 (perfect)
[fr]: HORS SERVICE               // r26: written (or overheard), nobody saying it to him
| 1: OUTSIDE SERVICE
| 2: OUT OF SERVICE
| 3: OUT OF ORDER
@news [fr] "Le président..."     // r26: the ticker, in a language, with its | lines
@read news                       // r26: he reads the ticker that's on now
```

r26: a line in another language shows what he makes of it at his points in
that language (0 to 3): at 0 the words as they are, marked "French he can't
follow"; at 1, 2 or 3 its `| 1:`, `| 2:` or `| 3:` version, with the words
on hover (and, for what he reads, above it). The poor version is believably
wrong, not just shorter (_Préviens-moi_ read as "prevent me", _seul_ as
"single"); the perfect one is the exact meaning. The validator wants all
three under every foreign line; a difficulty on one (`[fr medium]`) or a
meaning after " | " is a mistake now. The clock moves twenty seconds a
line and ten a choice.

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

r25: `heard` is whether the scene's last passive check was heard (a voice
with a difficulty), so what he only learns if he
heard it is set only then:

```
~ PERCEPTION medium: Six rows. Every hook full but one: forty-one.
if heard
  set key_gone
end
```

### Nothing he can't know (r25)

```
@fact knows_oak "grandson"
@fact knows_room|key_gone "forty-one" "41"
```

In the header, `@fact` names something he can only know once he's learned
it: the flags that mean he knows it (any of them) and the words that give
it away (whole words, any case). A line in **his** voice (narration, his
thoughts and voices, what he says, a choice's prompt, its options, their
reasons, a room's spots and deductions) that uses the words must either be
where he learns it (the flag `set` before the story next stops to ask
anything) or come after a condition that makes sure he knows it: the
scene's `@on ... if`, an `if` around it, an option's `if`, a flag set
earlier on every way into the scene (the validator follows the jumps). Other
people's lines are theirs: the barman can mention his grandson; Mr. Based
can only think about the pin once the barman has. `a or b` in a condition
counts for a fact of either flag.

r26: and everything else the page shows him that comes from the script:
a scene's title (on screen while it plays, and the label over a thing he
can look at, which the first scene looking at it gives, whatever he knows:
so it must give nothing away), a thought's label (`@on think "..."`), the
journal (`task`), what he's given (an item's name and what it says), a
skill's boost, a title card, the television's ticker, what he starts with,
and what he carries on with (`@carry "..." if ...`).

r26: and the names the page gives people. A name can be a fact
(`@fact heard_anselme|anselme_named "Anselme"`): the pop-ups ("Anselme warms
to you.", "… will remember that.") call someone by the body they are until
he knows the name (`@cast ANSELME "Anselme" body=BARMAN`: "The barman warms
to you."), and the script may make them speak (`ANSELME: ...`) or put them
under a portrait (`@figure ANSELME`) by that name only where he learns it,
or after. His dossier's people (`peopleKnown`) go by the same names.

The validator (`engine/Facts.ts`) checks every one of them;
`tests/based/BasedFacts.test.ts` also plays chapter one down 200 random
paths and fails if he's ever shown a fact before he's learned it, on any
of those surfaces, the dice and what counted on them included.

### What he carries (r22 BPLAY)

In the header:

```
@money 180
@item field_jacket "Field jacket" kind=clothes slot=jacket look=field_jacket icon=jacket bonus=ENDURANCE+1 start=worn "Black, zipped..."
@item gloves "Thin black gloves" kind=clothes slot=gloves icon=gloves bonus=INTIMIDATION+1,DEXTERITY-1 start=1 "In the jacket's inside pocket..."
@item umbrella "Black umbrella" kind=tool slot=hand icon=umbrella "A big black umbrella..."
@item matchbook "Le Vauban matches" kind=small icon=matchbook "A book of matches..."
```

- `kind=` clothes, tool, weapon, document, key or small. Money isn't an
  item: `@money` is what he starts with.
- `slot=`: clothes go on him (hat, glasses, neck, jacket, shirt, gloves,
  trousers, shoes); anything else can be held (`slot=hand`: a tool, a
  weapon, an umbrella). Without a slot it stays in his pockets.
- `bonus=SKILL+N,SKILL-N`: what it does to his skills while it's worn or
  held. It shows on the item, on his sheet (where each point comes from)
  and in every check's breakdown.
- `look=`: the 3D look he wears with it (only for clothes; see below).
  `icon=`: its drawing in the inventory (`client/ItemArt.ts`: jacket, tee,
  trousers, boots, gloves, phone, passport, matchbook, cigarettes,
  newspaper, umbrella, glasses, scarf, cap, lighter, baton, card, key,
  document, glass, watch, thing; otherwise its kind's).
- `start=worn` or `start=N`: what he begins with. A save from before he
  carried anything gets this kit.

In scenes:

```
give matchbook          // into his pockets (give key 2 for two)
take matchbook          // out of his pockets, or off him
equip umbrella          // puts it on, or in his hand (giving it him first if he hasn't it)
unequip hand            // a slot: back into his pockets
pay 16                  // euros (never below nothing)
earn 20
```

Conditions: `has.KEY` (in his pockets, worn or held), `wears.KEY` (worn or
held), `money >= 6`, `armed` (a weapon in his hand), `time >= 23:00` (the
hour, HH:MM) and `weather.rain` (rain, drizzle, clear or fog: what the
world shows, or the story's own weather).

```
choose "He's holding out the cigarette."
  * needs=matchbook|cigarettes [Offer him one] "Smoke?"     // any of them
  * white INTIMIDATION medium if armed [Let him see what's in your hand]
    bonus +1 if wears.gloves "Gloves: no prints"
  * silent [Leave him be]
end

== use_card "Delorme's card"
@on use delorme_card     // the inventory's Use, while he's free
```

- `needs=` goes before `if` and any check. The option shows, shut, saying
  what it needs, until he has one of them; the clock never takes it.
- `@on use KEY [once] [in=place] [if condition]` starts a scene when he
  uses something he has.
- People can read a weapon: put a scene with `@on talk WHO if armed`
  before their others. (Chapter one had them for the baton until r26.)
- The player can change clothes at any moment, even with a check on
  screen; the check is worked out again (a hat that helps reopens a white
  check that failed).

The validator checks that every item named (give, take, equip, has.,
wears., needs=, @on use) is an @item; every equip is something worn or
held; every bonus names a @skill; nothing is worn twice in one slot at the
start; an option with `needs=` is never the one that's always there; and
that **an item a scene needs can be got before it**: he starts with it, an
earlier line of that scene gives it, or a scene that gives it can be
reached from the start without going through the one that needs it.

**Looks and outfits.** Mr. Based is one solid mesh (the owner's model,
`look=field_jacket` on his jacket), so only that outfit has a model.
Other clothes keep their effect on his skills and their own drawing, and
leave him looking as he does. When the owner sends the same man in another
outfit: add it as a look in `client/world/people/Looks.ts` with its
`model=` (as `field_jacket` is), and give the clothing item `look=` that
look; putting it on then changes him in the world (the first worn thing
with a look decides, head to foot). What he holds is drawn at his hand by
the world (an umbrella opens over him outdoors and keeps the rain off; a
baton; anything else as a small dark shape) unless a person takes it
through `setHeld`.

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
@actor REGULAR stool_4 sit idle=drink in=vauban   // r25: a life of their own
@actor COUPLE_M couple_m sit idle=talk:window      // talking with the rest of "window"
@sound bar_bell                    // r25: a sound, once (door_open, door_close, bar_bell, desk_bell,
                                   // lift_button, rope, key, tv_off, coins, match, glass, page, siren)
```

r25: `idle=` gives someone a life while the story asks nothing of them,
played by the world: `drink` (a drink now and then, a nod), `read` (a book
in hand, a page turned), `talk:group` (the people of a group talk one at a
time, with pauses, and nod). People with an idle cast no shadow (they're
the room, and the room keeps to its budget). A save keeps it.

The validator checks every mark, hotspot, shot and prop against the place
each scene is in.

### The places (r21)

`places/<key>.json` lists a place's pieces (floors, walls with windows and
doors, the bar, the back bar, lamps, façades, signs, posters, furniture from
`models/fusion_props.glb` and `models/props.glb`...), its lights, the marks people stand at, the hotspots
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

### Things to examine (r22 BPLAY)

The street, the bar and the lobby hold some fifty things to look at (a
matchbook bowl, the tip jar, a moped, a dog's water bowl, the guest
book...). Each is a hotspot in the place's data, a piece of the kit to draw
it, and its text in the story:

```json
"hotspots": { "moped": { "at": [6.6, 0.7, 5.15], "r": 0.6, "stand": "see_moped" } },
"marks": { "see_moped": { "at": [6.6, 4.3] } },
"items": [{ "kind": "moped", "at": [6.6, 0, 5.15] }]
```

```
== moped "A moped"
@on look moped once
A moped at the kerb...
~ PERCEPTION medium: The seat's still dry...
-> FREE

== moped_again "A moped"
@on look moped
The moped, the helmet on its mirror...
-> FREE
```

- Nothing lists them: they glint when he's near enough (Perception), Tab
  names what's near. Give each a plain `@on look` (no `once`, no `if`) so
  it can always be looked at again, unless he takes it away.
- Often a skill chimes in (a passive voice), and some give an item, money,
  a clue (a flag another scene reads, or a bonus on a check) or a thought;
  some have a white check to dig deeper.
- Some change with `weather.` or `time` (the puddle under the awning, the
  radio after eleven, the lit window across the street).
- The kit's small pieces (`client/world/Kit.ts`): kiosk, moped, aframe (a
  chalkboard: `text`, `sub`), bollard, grate, bowl, postbox,
  litter, jar, matchbowl, frame, standjar, keyboard, machine, liftdoor,
  vase, clock, book, bell, tray (`size`, `color`), radio; and `box`,
  `sign`, `morris` (r23) and the props models. Whatever stands on the
  floor is solid by itself (r23, below); `"solid": false` lets him walk
  through a piece, `"solid": true` makes one the kit doesn't know solid
  (a box of its `size`).
- They cost next to nothing to draw: a small piece's colours are painted
  into its shape and every small piece in a place shares two materials
  (matte and metal), so the place's static merge draws them all in two
  draws, whatever their colours. Prefer a new small piece to a props model
  for a little thing (each model brings its own materials). What glints is
  one instanced draw for the whole place, however many things glint.
- The tests check each can be walked to from every door of its place.

### Art and sound

r25: the sound lives in `audio/` as mono MP3 (64 kbps, the score 56):
loops (`LOOPS` in `client/SoundTable.ts` gives each its exact length, for
decoders that keep the encoder's delay), the score's cues (`score_street`,
`score_bar`, `score_night`) and sprites (`things`, `paper`, `dice`,
`stings`, `clinks`, `steps_<surface>`), short sounds one after another in
fixed slots. Every file is credited in `art/credits.json` ("Sound" or
"Music"): CC0, public domain, CC BY, or original work made for the game in
code. A place says what it sounds like in its data:

```json
"sound": {
  "beds": [{ "key": "rain", "gain": 0.75, "rain": true }],
  "areas": { "bar": { "beds": [{ "key": "murmur", "gain": 0.42 }], "random": [{ "key": "clink", "every": [6, 16], "gain": 0.22 }] } },
  "spots": [{ "key": "awning", "gain": 0.7, "rain": true, "at": [2.2, 14.2], "r": 3.2 }],
  "tv": { "key": "tv_hum", "at": [3.6, -4.45], "r": 6, "gain": 0.22 },
  "random": [{ "key": "siren", "every": [75, 170], "gain": 0.3 }],
  "music": "street"
}
```

Beds play all the time in the place (`rain` ones louder the harder it
rains), or in one room of it; spots grow louder near a point (the rain on
the pharmacy's awning); the TV hums while it has news; `random` comes now
and then; `music` is the score's cue (or one per room). A door's hotspot can
say its sound (`"sound": "bar_bell"`, `"stairs"`). A place without `sound`
plays the story's `@ambient`. Footsteps follow the floor piece underfoot
(tiles, oak, carpet, stone; wet stone in the rain), his louder than other
people's. The score plays a cue on arriving somewhere new, then rests a
minute or so, and steps back under dialogue. The settings have Volume (all
of it), Music, Ambience and Effects, and Sound on or off; nothing plays
before the first click or key, and nothing while the tab is hidden.

Pictures go in `art/` as WebP (≤ 250 KB, graded to match: cool shadows, amber
highlights), backdrops 1600×900, portraits 720×900, and every one is listed in
`art/credits.json` with its author, licence and source. So is every model in
`models/` (CC0: Quaternius' base characters and animations, Kenney's
furniture still used: the plants, the doormat, the palace's chair),
compressed with meshopt and under 400 KB each (a character's own model, up
to 1 MB: see People and models). r23: the rest of the furniture, the
street's and the cars were modelled for the game in Autodesk Fusion
(`fusion_props.glb`, credited as original work). Only CC0, public
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

r22 BPLAY adds two optional ones (`client/world/PeopleHooks.ts`): a
person may implement `setLook(look)` (change outfit in place; otherwise
the world rebuilds them in the new look, where they stood) and
`setHeld(prop)` (take a prop in hand; otherwise the world carries it at
their right hand bone each frame).

On each person, `setWetness(k)` (0 dry to 1 soaked: clothes and hair
darker and glossier, cheaply, on the person's own material; on a model
with a wetness mask, by the mask) and
`setGait("walk" | "run")` (running lasts until they next arrive; walking
is 1.15 m/s, running 5.2 m/s since r23, with the jog clip). r23: people
implement `setHeld` too: the prop sits in their right hand (below).

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

## The furniture and the street, modelled in Fusion (r23)

The bar stools, the bentwood chairs, the marble bistro tables, the club
armchair, the coat stand, the Paris bench, the street bin, the street
lamps, the Morris column, the parked cars and the police van were modelled
for Mr. Based in the owner's Autodesk Fusion (OBJ, centimetres, a group
per material), then made small for the game in Node: each material's part
welded, simplified with meshoptimizer to an error found so the prop keeps
to its budget (1,300 triangles for a table to 5,200 for the van; sub-
millimetre to 3 mm off the original), given creased normals (hard edges
crisp, curves round), the Morris column's poster band cylindrical UVs;
then glTF-Transform (dedup, quantize, meshopt): `models/fusion_props.glb`,
276 KB, 27,000 triangles in all. They take Kenney's names (`stoolBar`,
`chair`, `tableRound`, `loungeChair`, `coatRackStanding`, `bench`,
`trashcan`, `sedan`, `van`; new: `lamppost`, `morrisColumn`), so a place
names them as before; made to size, so a place gives no `height`.

- **Materials** come from the meshes' names: the palette in
  `client/world/Palette.ts` (leather, wood, iron, brass, marble, rattan,
  green iron, oak slats, the bin's bag, car paint, the van's white and its
  stripes and light bar, glass, tyres, hubs, trim, lamps). One material
  per name for every prop and place, so the static merge bakes eleven
  stools into four draws. A place can recolour one (`"mats": { "paint":
"#4a2e2c" }`, or `"tint"` for the paint): it keeps the palette's finish.
- **The street lamps** (`lamppost`) are the Fusion post, its panes and
  bulb lit, with the light, halo, cone and reflection hung at its lantern.
- **The Morris column** (`morris`): `posters`, oldest first, pasted round
  its band in two tiers, each `{ "text", "seed" }` (the party's poster,
  as on the walls) or `{ "text", "style": "bill", "sub", "paper", "ink" }`
  (words alone). Words live in the place's data, as on any sign.

## Nothing walks through anything (r23)

The walking grid is blocked wherever a piece stands (`engine/Solid.ts`):
each props model by its footprint (`engine/Props.ts`, the hull of what a
body could walk into, from the floor to head height, generated from the
models; a test checks it against them), and the kit's own pieces by their
size (the bar's counter and the back bar, boxes, the kiosk, the moped, the
post box, the chalkboard, the cigarette machine, the umbrella stand, the
coats on their stand, the lamp posts, the Morris column...). A cell is
blocked if it comes within the piece's margin of it: 15 cm, or 10 cm for
seats and tables (he slips between two stools to reach the bar). Flat
things (rugs, puddles, footprints, glows, a drain) and anything up on a
counter or a wall are walked over or under. The place's own `nav.blocks`
are only its walls.

- A click on something solid (or on a place walled off) walks him to the
  nearest point he can reach.
- A click on a free stool or chair walks him to it and sits him down;
  seated, he reads the room as on the story's stools; a click on the
  floor gets him up.
- People sit on a seat at its height: each body's own seat height is
  measured in the sitting clip (what rests on the seat: trousers, a skirt,
  an apron), and a mark beside a seat puts them on it, hips over its
  middle, facing the way a chair faces.

## Walking and running (r23)

- **The pace**: walking 1.15 m/s, running 5.2 m/s (`engine/Walk.ts`).
- **The legs**: the walk and the jog are blended over the standing pose by
  pace, and their cycle moves on by the ground covered over the stride
  measured on each body, so a planted foot stays put at any pace (on the
  owner's model the walk slid 11 per cent of the pace in r22, the run 137
  per cent; now 2 to 4).
- **The path**: corners rounded where the floor allows; the walker eases
  up to pace and down to a stop exactly at the end, turns at most 5.5
  radians a second (7 running), slows to a shuffle while turned away (so
  he steps round instead of sliding sideways), and turns to what he came
  to as he arrives.
- **The camera** follows as a critically damped spring (no jolt starting
  or stopping, never past him).
- **Double-click** runs; a beating double ring where he's going says so.

## Held things (r23)

What he holds (the world's prop: the umbrella, the baton, a small thing)
the person carries in the right hand: its grip in the palm (past the wrist
along the forearm), a baton or a furled umbrella along the line of the
fist and a little forward; under an open umbrella his forearm comes up
before his chest and the shaft stands straight over his head. A prop's
grip is its origin and it runs down its -y (`heldProp` in `World.ts`).

## Leaning on the counter (r26)

`@actor BARMAN behind_bar lean` puts him at the counter in front of the
mark, not on the mark itself: the leaning clip is measured on each body
(`measureLean` in `client/world/People.ts`: where the feet are, the body's
front below the arms, the elbows, the forearms' underside), and
`engine/Lean.ts` finds the `bar` piece in front of the mark and stands him
with his body a centimetre clear of the top's edge, his elbows at it and
his forearms and hands on the top; he's lowered (or raised) the few
centimetres to the top's height. The clip stands its feet behind its root,
so while it plays the body is shifted forward by that much (by the clip's
weight through the fades) and the feet stay where they are. A leaning
person talks leaning. If their body changes (their own model loads after
the stand-in), they're put at the counter again. `tests/based/BasedLean.test.ts`
checks every lean in the story against the counter.

## The story waits for the moves it asks for (r26)

While someone the story moved (`@actor ... walk`: to a mark, onto a stool,
out of a door, the clerk to the rope, Mr. Based to his stool) is still on
the way, sitting down or getting up, or turning to face what they came to,
the next line, card, check, choice or room waits: nothing advances or is
chosen (clicks, Space or Enter, the number keys), and the continue mark
shows a dimmed "…". It appears once they're there and settled. The world
watches each move (`engine/Moves.ts`) and finishes one that runs far past
what its walk should take (two and a half times its walking time plus four
seconds, six at least, in the world's own time, so `__basedTimeScale`
speeds it up in tests): there at once, in their pose, so a stuck walk can
never hold the story. A loaded game, the free world and the end are never
held (`client/Hold.ts`).
