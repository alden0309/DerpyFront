// MR. BASED, Chapter One: Eleven Days
// The format is described in src/based/README.md. Every character, the
// party and the government are invented.
//
// r22: an open world, in the manner of Disco Elysium. A short opening walks
// him down the rue de Grenelle to Le Vauban; from then on the player takes
// him where they like. Scenes with "@on" are started by what the player
// does: going up to someone (talk), looking at something (look), walking
// into a place (enter), following a thought (think), or by themselves once
// something is true (auto). "-> FREE" hands him back to the player.
//
// Nobody in the bar knows him: not the barman, not the man in grey. He's
// here to meet London's contact, and to be nobody while he does it.

@chapter 1 "Eleven Days"
@summary "Paris, a wet night, eleven days after the election. A new government, an old bar, and London's contact somewhere in it."
@start open
@time 21:40

// He wears what the owner's own model wears (BPEOPLE r22): a black zip field
// jacket with a stand collar over a dark olive tee, black cargo trousers,
// black boots and a wristwatch. It is one mesh: nothing comes off.
@cast BASED "Mr. Based" portrait=based_portrait look=field_jacket
@cast BARMAN "The barman" portrait=anselme look=barman
@cast ANSELME "Anselme" portrait=anselme body=BARMAN
@cast STRANGER "The man in grey" portrait=stranger look=suit_grey
@cast DELORME "Delorme" portrait=stranger body=STRANGER
@cast WOMAN "The woman in the corner" portrait=penhallow look=wool_woman
@cast PENHALLOW "Penhallow" portrait=penhallow body=WOMAN
@cast WATCHER "The man under the awning" look=coat_dark
@cast PORTER "The desk clerk" look=desk_clerk
// r25: Le Vauban's regulars, for a livelier bar. Nobody the story needs.
@cast REGULAR "The old man at the bar" look=old_beret
@cast WORKER "The man in the blue jersey" look=worker_blue
@cast COUPLE_M "The man in the tan coat" look=trench_tan
@cast COUPLE_F "The woman in the red coat" look=coat_red
@cast READER "The man with the book" look=sweater_grey
@cast PRESIDENT "Montclar" look=suit_dark
@cast COLONEL "The Colonel" look=uniform_navy

// His skills: three attributes, four skills each. A check is two dice plus
// the skill against the difficulty; a passive one is the skill plus six.
@attribute SOCIAL "Social" "Other people: what they want, what they fear, what they'll believe."
@attribute INTELLIGENCE "Intelligence" "The trained mind: files, faces, tongues, the craft."
@attribute PHYSICAL "Physical" "The body that carried him through seventeen years: eyes, hands, nerve."

@skill CHARISMA SOCIAL "Charisma" "Being liked on purpose. The right joke at the right moment, and people telling him things because they want to."
@skill INTIMIDATION SOCIAL "Intimidation" "Making a man wonder what you'd do. Leaning on him until he tells you."
@skill EMPATHY SOCIAL "Empathy" "Tells and griefs and hopes. What a face is doing while the mouth talks."
@skill DECEPTION SOCIAL "Deception" "Covers and legends. The face that gives nothing away, and the lie that fits the room."
@skill MEMORY INTELLIGENCE "Memory" "Faces, files, names and dates. Seventeen years of them, filed and cross-filed."
@skill INSTINCT INTELLIGENCE "Instinct" "The job in the gut. Watchers, signals, drops; the second before it goes wrong."
@skill LANGUAGES INTELLIGENCE "Languages" "Ears and tongues: his points in each language come from it. Accents, and what they give away."
@skill FOCUS INTELLIGENCE "Focus" "Putting it together. The detail that doesn't fit, held still until it does."
@skill STRENGTH PHYSICAL "Strength" "Shoulders and grip. A door that won't give, a man who won't let go."
@skill ENDURANCE PHYSICAL "Endurance" "Cold, rain, long nights, the drink he didn't want. Holding on when it hurts."
@skill DEXTERITY PHYSICAL "Dexterity" "Quick hands. A card palmed, a page turned, a pocket that never felt a thing."
@skill PERCEPTION PHYSICAL "Perception" "Eyes and ears. What's in the room before anyone tells him."

@points 9 min=1 max=5
@archetype ANALYST "The Analyst" SOCIAL=2 INTELLIGENCE=4 PHYSICAL=3 signature=MEMORY "Seventeen years of reading other people's mail. He remembers everything, which is the trouble."
@archetype HANDLER "The Handler" SOCIAL=4 INTELLIGENCE=3 PHYSICAL=2 signature=EMPATHY "He ran agents in four capitals. People told him things they hadn't told their wives."
@archetype OPERATOR "The Operator" SOCIAL=3 INTELLIGENCE=2 PHYSICAL=4 signature=PERCEPTION "Cars, borders, bridges at night. The one they sent when it had to work."

// The languages he can speak, besides his own American English. At the
// start the player spends his Languages skill's points on them, 0 to 3
// each. r26: British English is gone (he's American, and English is his
// own); French and Russian take up to six points between them, which is
// the most a Languages skill gives (5, and 1 for a signature), so no point
// is wasted.
//
// r26, the owner's language system: his points are how well he follows
// everything in that language, said or written. 0: none (he sees only the
// words). 1: poor (a poor translation, believably wrong). 2: decent. 3:
// perfect. Every foreign line carries all three versions ("| 1:", "| 2:",
// "| 3:"), and whatever depends on having understood it asks for the level
// it needs (`speaks.fr >= 2`), with a way through for less.
@language fr "French"
@language ru "Russian"

// --- What he carries (r22 BPLAY) ----------------------------------------------
// Clothes change his skills while he wears them; a weapon or a tool works
// in his hand. Only the field jacket has a 3D model so far (the owner's own,
// look=field_jacket); the rest change his skills and have their own picture,
// and leave him looking as he does until a model of that outfit exists.
@money 180

@item field_jacket "Field jacket" kind=clothes slot=jacket look=field_jacket icon=jacket bonus=ENDURANCE+1 start=worn "Black, zipped, a stand collar, and pockets where seventeen years taught his hands to expect them. It keeps the rain out better than it keeps anything in."
@item olive_tee "Olive tee" kind=clothes slot=shirt icon=tee start=worn "Dark olive cotton, washed soft. Nothing written on it, which is the point."
@item cargo_trousers "Cargo trousers" kind=clothes slot=trousers icon=trousers start=worn "Black, with pockets on the thighs. A man in these could be going to a building site or a border."
@item boots "Black boots" kind=clothes slot=shoes icon=boots bonus=DEXTERITY+1 start=worn "Rubber soles that say nothing on wet tiles. He resoled them in Vienna and hasn't worn anything else since."
@item gloves "Thin black gloves" kind=clothes slot=gloves icon=gloves bonus=INTIMIDATION+1,DEXTERITY-1 start=1 "In the jacket's inside pocket. A man in gloves indoors is a man with plans, and everybody knows it."
@item phone "Phone" kind=small icon=phone start=1 "A cheap phone with one number in it. The number starts with a London code."
@item passport "Passport" kind=document icon=passport start=1 "American, in the name of John Locke: London's work, and good work, down to the worn corners and a visa stamp from a trip John Locke never took. His own face, a little tired. John Locke buys wine for an importer in San Diego and is over for the tastings. The less he has to remember, the less he can forget. London says a lot of things."

@item matchbook "Le Vauban matches" kind=small icon=matchbook "A book of matches from the bowl on the bar: LE VAUBAN in gold on oxblood, and the hotel's number. Twenty matches, which is nineteen more than a man needs to start a conversation."
@item cigarettes "Cigarettes" kind=small icon=cigarettes "A blue packet of Corsaires from the machine in the lobby. He quit in Vienna. He bought them anyway."
@item newspaper "Le Quotidien" kind=document icon=newspaper "Tonight's evening paper, left on the bar. RÉFÉRENDUM PAR DÉCRET across the top, and a photograph of the President looking reasonable."
@item umbrella "Black umbrella" kind=tool slot=hand icon=umbrella "A big black umbrella from the stand by the bar's door, nobody's for a week, the barman says. In his hand it keeps the rain off him."
@item delorme_card "Delorme's card" kind=document icon=card "Plain white, good stock. Delorme, in blue ink, and the hotel's number. Nothing on the back."
@item his_key "Key to room twenty-three" kind=key icon=key "A brass key on a heavy brass weight stamped 23, from the board behind the desk. The clerk laid it down so it wouldn't ring."

// --- What he can only know once he's learned it (r25) ------------------------
// A line in his own voice (narration, his thoughts, what he says, a choice)
// that uses these words must come where he learns it, with the flag set
// straight after, or after a condition that makes sure he has. Other
// people's lines are theirs. The validator checks every line (README:
// "Nothing he can't know"); the tests play it down random paths.
// The barman's grandson (r26): only if Mr. Based notices the barman
// searching the faces on the television (an Empathy check), and then asks;
// the pin, worn inside the lapel, if he asks about the boy. The man in
// grey's own pin only once he's seen it (his lapel, or the deduction it
// leads to).
@fact heard_grandson|knows_oak "grandson" "petit-fils"
@fact knows_oak "grandson's pin" "grandson wears" "grandmother won't see" "grandmother sees" "nobody's grandmother"
@fact lapel|party_man "oak-leaf pin" "party pin" "pin under" "under his lapel" "under your lapel" "bronze pin"
@fact knows_room|key_gone|heard_41 "forty-one" "41"
// r26: the clerk's call (in French): a car at six for forty-one at 2
// points, and where it goes, Satory, only at 3.
@fact knows_car "car at six"
@fact knows_satory "Satory"
@fact knows_stairs "service stairs" "the other ones"
@fact knows_marchal "Marchal"
@fact coats "camel coat"
@fact pours_drinks "aniseed" "drinks his Ricard" "Ricard in the palm" "pours his Ricard"
@fact knows_delorme|delorme_gone|met_contact|took_card "Delorme"
@fact heard_anselme|anselme_named "Anselme"
// r26: what she's called, once she's said it (until then the pop-ups call
// her the woman in the corner).
@fact met_contact|told_penhallow|knew_seen "Penhallow"
@fact knows_vidal "Vidal" "Réverbère"
@fact delorme_word "had a word with you"
@fact knows_versailles "01 39"
@fact room_late "made up" "isn't ready" "not ready"
// What they only know if they worked out that he was watching her (r25).
@fact knew_seen "seen together" "seen with me" "seen the two of them" "watching you" "watching Penhallow" "watching her" "blown" "before breakfast" "never seen" "disappear" "vanish"
@fact room_late|has_room "twenty-three"
// The smoker (r25): he offers a light only with one in his pocket.
@fact has_light "Need a light"
// r26: what the man under the awning said, only if he followed it.
@fact heard_alone "wanted to be alone"
// r26: the party's oak leaf, if he noticed it on the posters (Perception),
// or knows it some other way.
@fact saw_oak_emblem|knows_oak|party_man "party's oak leaf" "party's mark"
@fact met_watcher|saw_watcher|room_mirror "finally lit" "realised, the man under the awning"

@carry "You met London's contact. She's called Penhallow, and she argued against hiring you." if met_contact
@carry "You told Penhallow what the man in grey wanted." if told_penhallow
@carry "You kept the man in grey to yourself." if kept_quiet
@carry "You and Penhallow know the man in grey saw you together. After tonight, neither of you was ever at Le Vauban." if knew_seen
@carry "The man in grey thinks you buy wine for an importer in San Diego." if told_grey_wine
@carry "The man in grey knows your name." if gave_name
@carry "The man in grey knows you as John Locke." if gave_alias
@carry "A car takes room forty-one to Satory at six." if knows_satory and (knows_room or heard_41)
@carry "Delorme leaves the hotel at six every morning." if delorme_six and took_card
@carry "The barman has decided he likes you." if rel.anselme >= 2
@carry "Delorme's card has a Versailles number pressed into it." if knows_versailles and took_card
@carry "A journalist, Claire Vidal, is watching the hotel too." if thought_vidal and knows_vidal


// --- The opening: the rue de Grenelle ---------------------------------------

== open "Paris"
@place street
@weather rain
@ambient rain
@actor BASED street_start
@actor WATCHER watcher_spot fold
@actor BARMAN behind_bar lean in=vauban
@actor WOMAN corner_chair sit in=vauban
@actor PORTER porter_spot in=vauban
@actor REGULAR stool_4 sit idle=drink in=vauban
@actor WORKER stool_2 sit idle=drink in=vauban
@actor COUPLE_M couple_m sit idle=talk:window in=vauban
@actor COUPLE_F couple_f sit idle=talk:window in=vauban
@actor READER reader_chair sit idle=read in=vauban
set crowd
// r26: the ticker is in French: what he makes of it, when he looks at the
// television (@read news), is by his points in French.
@news [fr] "Le président Montclar annonce une « révision constitutionnelle de salut public » · L'Assemblée suspendue « le temps que la nation reprenne son souffle »"
| 1: President Montclar announces a "constitutional revision" of public greeting · The Assembly hung up "the weather that the nation takes back its breath"
| 2: President Montclar announces a "constitutional revision for public safety" · The Assembly is suspended "while the nation gets its breath back"
| 3: President Montclar announces a "constitutional revision of public safety" · The Assembly suspended "while the nation catches its breath"
@focus street_open
@card "PARIS" "Eleven days after the election"
It had rained every day since the election, as if the city were trying to wash something off and hadn't found the right soap.
@focus none
@actor BASED street_mid walk
London had given him the name of a hotel, a bar, a time and a contact: Le Vauban, on the rue de Grenelle, at ten. A woman with The Times, open at the crossword. And a room upstairs at the hotel, booked to a man named John Locke, Mr. Based's alias, a wine shipper from San Diego, California.
task contact "Meet London's contact at Le Vauban, on the rue de Grenelle, at ten: a woman with The Times, open at the crossword. She'll come to you once the room is clear. Ask her about seven down. The room upstairs is booked to John Locke."
~ Twenty minutes early. Time to look at the street the way the street was looking at him.
-> FREE


// r26: the slogan is L'HEURE DU CHANGEMENT, "Time for change" (the owner),
// read by his French. The oak leaf on them is the party's mark, and only a
// sharp eye picks it out (saw_oak_emblem): later he can know the pin by it.
== posters "The posters"
@on look posters once
On the boulevards the posters were coming away from the walls in long wet strips. The same face on all of them, most of it gone now, and under it the same three words: L'HEURE DU CHANGEMENT.
[fr]: L'HEURE DU CHANGEMENT
| 1: The changing of the hour. The clocks going back?
| 2: The time of change.
| 3: Time for change.
if speaks.fr >= 3
  The party was called Le Serment, and their slogan was the only promise it had ever made in plain words: Time For Change.
elif speaks.fr >= 2
  The party was called Le Serment, and their slogan was the only promise it had ever made in plain words: the time of change, or near enough.
elif speaks.fr
  The party was called Le Serment, and their slogan was the only promise it had ever made in plain words, if he had the words right. Something about the clocks.
else
  The party was called Le Serment, and their slogan was the only promise it had ever made in plain words, for anyone who could read them.
end
~ PERCEPTION challenging: In the corner of every one, small and bronze, an oak leaf. The party's mark, on everything they paste up.
if heard
  set saw_oak_emblem
end
if speaks.fr >= 2
  ~ Everybody in this city has been promised a change. It's just never the one they had in mind.
end
set posters
-> FREE

== posters_again "The posters"
@on look posters
if saw_oak_emblem
  The face on the posters had lost another strip to the rain. The oak leaf hung on, small and bronze, in every corner.
else
  The face on the posters had lost another strip to the rain. The slogan hung on.
end
~ PERCEPTION easy: Someone has been round with a brush and new paste. The rain takes them down by day and the Volunteers put them back by night.
-> FREE


== van "The police van"
@on look van once
At the corner of the rue de Grenelle a police van idled with its lights off and nobody in it.
~ INSTINCT medium: Engine running, nobody inside. Whoever left it means to come back to it quickly. They're close by.
set van
-> FREE

== van_again "The police van"
@on look van
The van idled on. The rain ran off its roof in a thin sheet, and nobody came back for it. Yet.
-> FREE

== pharmacy "The pharmacy"
@on look pharmacy once
The pharmacy was shut, its green cross ticking on and off above the awning. In the window, beside an advertisement for cough syrup, someone had taped a notice from the Préfecture.
[fr]: PAR ARRÊTÉ PRÉFECTORAL : les rassemblements de plus de cinq personnes sur la voie publique sont suspendus jusqu'à nouvel ordre, pour la durée de la révision constitutionnelle.
| 1: BY PREFECTURAL ARREST: the gatherings of more than five persons on the public way are suspended until a new order, for the hardness of the constitutional revision.
| 2: BY ORDER OF THE PRÉFECTURE: gatherings of more than five people in the street are suspended until further orders, for as long as the constitutional revision lasts.
| 3: BY ORDER: gatherings of more than five persons on the public highway are suspended until further notice, for the duration of the constitutional revision.
if speaks.fr
  ~ Every government that suspends anything says it's temporary. It never ends up being temporary.
  set curfew
end
-> FREE

== pharmacy_again "The pharmacy"
@on look pharmacy
if curfew
  The cross went on ticking green over an empty pavement. Five persons, he thought. He made one.
else
  The cross went on ticking green over an empty pavement, and the notice in the window went on saying whatever it said.
end
-> FREE


== flyer "A leaflet in the gutter"
@on look flyer once
A leaflet had stuck itself to the kerb by the bench, the ink running. A bronze oak leaf at the top, and a young man in a good coat with his hand on his heart.
[fr]: LES VOLONTAIRES DU SERMENT RECRUTENT. L'heure du changement a sonné. Et vous ?
| 1: THE VOLUNTEERS OF THE SERMON RECRUIT. The hour of the change has rung. And you?
| 2: THE VOLUNTEERS OF THE OATH ARE RECRUITING. The time for change has come. And you?
| 3: LE SERMENT'S VOLUNTEERS ARE RECRUITING. Time for change has come. What about you?
~ MEMORY medium: The Volunteers. Le Serment's young men, eighteen months old as an organisation and already in leaflets this good. Somebody is paying for the paper.
set flyer
-> FREE

== flyer_again "The leaflet"
@on look flyer
The leaflet was turning to pulp. The young man's hand was still on his heart.
-> FREE


// --- Things in the street (r22 BPLAY) -----------------------------------------
// Nothing lists them: they glint when he's near enough to notice. Some
// change with the weather or the hour; some give him something.

== morris "A Morris column"
@on look morris once
A Morris column on the far pavement, green iron and a little dome, the kind that has stood on Paris corners since there were theatres to advertise. Nobody was advertising theatres on it now.
The top tier was the party's: the face and L'HEURE DU CHANGEMENT, pasted all the way round so it could watch the street from any side. Under it, where the rain had lifted a corner, a theatre's bill with one word across it:
[fr]: RELÂCHE · jusqu'à nouvel ordre
| 1: RELAX · until a new order
| 2: NO SHOW · until further notice
| 3: NO PERFORMANCES · until further notice
Under that, a woman's smile and half a name.
if knows_marchal
  ~ Marchal again, under everything, the way a fact sits under the morning's paper.
end
~ PERCEPTION medium: The party's posters went up last night: the paste under them is still tacky at the edges. And the newest one has been pasted exactly over the smiling woman's mouth. Nobody does that by accident.
~ MEMORY easy: Her posters went up the week of the first round. Since then someone has been going from column to column, pasting the party's new posters over hers, a layer at a time, until there's nothing of her left showing.
set saw_morris
-> FREE

== morris_again "A Morris column"
@on look morris
if knows_marchal
  The Morris column in the party's paper. The rain had worked another corner loose, and one of Marchal's eyes looked out from under it.
else
  The Morris column in the party's paper. The rain had worked another corner loose, and one of the smiling woman's eyes looked out from under it.
end
-> FREE


== old_poster "An older poster"
@on look old_poster once
Where the party's posters had peeled, an older one showed underneath: a woman of sixty in a plain jacket, smiling as if she'd been told to, and half a name. MARCHAL.
~ MEMORY medium: Hélène Marchal. The other candidate. Forty-eight per cent, and she conceded before midnight because the Republic needed calm. The Republic got calm. It's getting a great deal of it.
set knows_marchal
-> FREE

== old_poster_again "An older poster"
@on look old_poster
if knows_marchal
  Marchal's smile, under a strip of somebody else's promise. The rain was working on both of them equally.
else
  A woman's smile under a strip of somebody else's promise. The rain was working on both of them equally.
end
-> FREE


== chalkboard "Le Vauban's chalkboard"
@on look chalkboard
A chalkboard on the pavement outside Le Vauban, wiped and written in a careful hand. Croque-monsieur, nine euros. And underneath, smaller:
[fr]: Pas de politique au comptoir.
| 1: Not of politics at the account.
| 2: No politics at the counter.
| 3: No politics at the bar.
if speaks.fr >= 2
  ~ Somebody in there has a sense of humour, or a very good reason.
elif speaks.fr
  ~ Politics, and an account. A bar that won't run a tab for politicians, maybe.
end
if weather.rain
  The rain had got at the bottom line, and the chalk was running down the slate in thin white tears.
end
-> FREE


== hotel_plaque "The hotel's plaque"
@on look hotel_plaque
A brass plaque by the hotel door, polished thin by a century of thumbs: HÔTEL VAUBAN, 1921, and three stars someone had added later in a different brass.
~ MEMORY easy: 1921. The year after the last war that was supposed to end them. They named it for the man who built France's walls.
-> FREE


== post_box "A post box"
@on look post_box
A yellow post box on a post, its mouth taped over with a printed notice.
[fr]: LEVÉES SUSPENDUES JUSQU'À NOUVEL ORDRE
| 1: LIFTINGS SUSPENDED UNTIL A NEW ORDER
| 2: COLLECTIONS SUSPENDED UNTIL FURTHER ORDERS
| 3: NO COLLECTIONS UNTIL FURTHER NOTICE
if speaks.fr >= 2 and knows_car
  ~ So nothing leaves Paris tonight in an envelope. Whatever leaves goes in a car at six in the morning, or in somebody's head.
elif speaks.fr >= 2
  ~ So nothing leaves Paris tonight in an envelope. Whatever leaves goes by car, or in somebody's head.
else
  ~ Taped shut, whatever the notice says. Nothing goes into it tonight.
end
-> FREE


== kiosk "The newspaper kiosk"
@on look kiosk once
A green kiosk with its shutters down for the night. Yesterday's front pages were still clipped behind the wire, curling in the wet. Across the top of one, in letters a hand high:
[fr]: PAS UN COUP D'ÉTAT, UN COUP DE BALAI
| 1: NOT A STROKE OF STATE, A STROKE OF BROOM
| 2: NOT A COUP, A SWEEP OF THE BROOM
| 3: NOT A COUP, A CLEAN SWEEP
if speaks.fr >= 2
  ~ MEMORY medium: The President's line from Sunday; the paper had printed it as a headline, not a quote.
end
set read_kiosk
-> FREE

== kiosk_again "The newspaper kiosk"
@on look kiosk
The kiosk's shutters stayed down. Yesterday's front pages went on curling behind the wire.
-> FREE


== moped "A moped"
@on look moped once
A moped at the kerb, grey under the streetlight, a helmet hooked on the mirror. On the front mudguard, a small sticker: a bronze oak leaf.
if weather.rain or weather.drizzle
  ~ PERCEPTION medium: The seat's still dry. Whoever rode it here arrived after the rain started again, and is still close.
else
  ~ PERCEPTION medium: The engine's ticking as it cools. Ten minutes, no more.
end
set saw_moped
-> FREE

== moped_again "A moped"
@on look moped
The moped, the helmet on its mirror, the little bronze leaf. Nobody came for it.
-> FREE


== drain "The drain"
@on look drain
if weather.rain or weather.drizzle
  The gutter ran fast and loud into the grating at the kerb, carrying a cigarette packet, a leaf and a Volunteers' leaflet down into the dark.
else
  The rain had stopped, but the drain at the kerb was still talking to itself, somewhere underneath.
end
if thought_rain
  ~ To the Seine, and west, and the sea, and England.
end
-> FREE


== bench_plaque "The bench"
@on look bench_plaque
A small brass plaque screwed to the back of the bench, gone green at the edges.
[fr]: À Marcel, qui aimait ce quartier et ne l'a jamais quitté.
| 1: To Marcel, who aimed for this quarter and never quit.
| 2: To Marcel, who loved this neighbourhood and never left.
| 3: To Marcel, who loved this quarter and never left it.
if speaks.fr >= 2
  ~ They put it on a bench, so he still hasn't.
end
-> FREE


== dog_bowl "A dog's bowl"
@on look dog_bowl
A steel bowl on the step of the closed pharmacy, put out for the dogs of the quarter.
if weather.rain
  The rain had filled it to the brim and was still filling it.
elif weather.clear
  The water in it had gone still enough to hold the green cross, upside down.
else
  It was full of rainwater and the odd plane leaf.
end
~ EMPATHY easy: The pharmacist is shut for the duration, and still puts out water for the dogs. That's a kind of politics too.
-> FREE


== awning_puddle "A puddle under the awning"
@on look awning_puddle
if weather.rain
  Water ran off the edge of the pharmacy's awning in a line of drops, each one hitting the puddle beneath in the same place, over and over.
elif weather.fog
  The puddle under the awning had gone white with the fog's light, and the green cross floated in it like something drowned.
else
  The rain had stopped, but the puddle under the awning hadn't heard. The green cross ticked on and off in it, and above it, upside down, the lit windows of the building opposite.
  ~ PERCEPTION medium: And in one of the windows, upside down, a figure standing well back from the glass. Watching the street, or the bar.
  set saw_upstairs
end
-> FREE


== cig_ends "Cigarette ends"
@on look cig_ends
Cigarette ends under the awning, on the wet stone where the man stood, a little constellation of them.
~ INSTINCT medium: Nine, none smoked past halfway. Nine cigarettes lit and put out without wanting them. He isn't smoking. He's keeping time.
if heard
  set counted_ends
end
-> FREE


== bin "The litter bin"
@on look bin once
The bin by the lamppost was stuffed full of Volunteers' leaflets, a whole bundle, still in its paper band, never handed out.
~ PERCEPTION easy: Not thrown away one by one. Dumped, all at once, by whoever was given them to hand out.
if speaks.fr >= 2
  ~ Somebody on the rue de Grenelle has decided the change can wait.
else
  ~ Somebody on the rue de Grenelle has had second thoughts.
end
set dumped_leaflets
-> FREE

== bin_again "The litter bin"
@on look bin
The bundle of leaflets in the bin had begun to swell with the wet, the band still around them.
-> FREE


== press_car "A parked car"
@on look press_car once
A grey saloon parked half on the kerb, a parking ticket under the wiper and a laminated card on the dashboard: PRESSE.
choose "The card has a name on it, under the photo."
  * white PERCEPTION medium [Read the card through the glass]
    bonus +1 if not weather.rain "The windscreen isn't streaming"
    The streetlight lay across the windscreen. Claire Vidal, Le Réverbère, and a photograph of a woman who looked as if she hadn't slept since the election either.
    ~ FOCUS: A journalist parked at the corner of the hotel's street, at ten at night, with a ticket she hasn't bothered to take. She's watching something too.
    set knows_vidal
  fail
    The rain on the windscreen turned the card to a white blur with a smaller blur on it.
  * silent [Leave it]
end
~ FOCUS easy: The ticket's timed 21:12. Somebody's still writing tickets tonight. The Préfecture likes to look busy while it decides whose side it's on.
-> FREE

== press_car_again "A parked car"
@on look press_car
if knows_vidal
  Claire Vidal's car, the ticket going soft under the wiper. No sign of Claire Vidal.
else
  The grey saloon, the PRESSE card, the ticket. The rain on the glass.
end
-> FREE


== lit_window "A lit window"
@on look lit_window
if (time >= 23:30 or time < 06:00) and saw_lit_window
  The window on the third floor across the street had gone dark at last. Whoever had been watching the President had given up on him.
elif time >= 23:30 or time < 06:00
  A third-floor window across the street, dark, the curtains not quite drawn. Paris had gone to bed, or was pretending to.
else
  A third-floor window across the street, blue with a television. Through the gap in the curtains, a woman in a dressing gown, standing, not sitting, to watch the President speak.
  ~ EMPATHY medium: Standing for him. People only stand for something they're afraid of, or something they love, and from here he can't tell which.
  set saw_lit_window
end
-> FREE


// r25: the man under the awning. Talking to him is Mr. Based offering a
// light; he wants to be alone, and that's the end of it. He stays where he
// is: the street needs him there (the mirror, the signal).
// r25: he offers a light only when he has one (matches from the bowl on the
// bar, or the barman's: `has_light`). Without, a nod the man
// doesn't return; once he has one, the offer, while the man's still there.
== watcher "The man under the awning"
@on talk WATCHER once if has_light and has.matchbook
if saw_watcher
  The man under the awning still hadn't lit his cigarette.
else
  Under the awning of the closed pharmacy, out of the rain, a man in a dark coat was holding a cigarette he hadn't lit.
end
He tore a match from Le Vauban's book and held it ready to strike.
BASED: Need a light?
The man looked at him, and then at the cigarette, as if he'd forgotten it was in his hand.
WATCHER [fr]: Non, merci. Je veux juste être seul.
| 1: No, thank you. I just want to be single.
| 2: No, thanks. I just want to be on my own.
| 3: No, thank you. I just want to be alone.
set met_watcher
// r26: what he makes of it is his French; with less than decent French, a
// way to ask again in English (the owner: "need an option if the player
// chose no skill into French or poor French").
if speaks.fr >= 2
  He turned his shoulder to the rain, and to him, and that was the end of that.
  set heard_alone
elif speaks.fr
  choose "Single. He'd offered the man a match, not a proposal."
    * [Ask again, in English] "Sorry. My French. You want...?"
      WATCHER (in English, wearily): Alone, monsieur. I want to be alone.
      set heard_alone
      He turned his shoulder to the rain, and to him, and that was the end of that.
    * silent [Leave him to it]
      He turned his shoulder to the rain, and to him. Whatever he wanted to be, he wanted it without company.
  end
else
  choose "French, and none of it sounded like yes."
    * [Try English] "Sorry. English? A light?"
      WATCHER (in English, wearily): No. Alone. Please.
      set heard_alone
      He turned his shoulder to the rain, and to him, and that was the end of that.
    * silent [Leave him to it]
      He turned his shoulder to the rain, and to him. The words were lost on him; the shoulder wasn't.
  end
end
-> FREE

== watcher_idle "The man under the awning"
@on talk WATCHER if met_watcher
The man under the awning didn't look round.
WATCHER [fr]: Seul, monsieur. J'ai dit.
| 1: Single, monsieur. I have said.
| 2: On my own, monsieur. I said so.
| 3: Alone, monsieur. I said.
-> FREE

== watcher_nod "The man under the awning"
@on talk WATCHER once
Under the awning of the closed pharmacy, out of the rain, a man in a dark coat stood turning an unlit cigarette in his fingers.
He gave the man a nod. The man looked at the rain instead.
set saw_watcher
-> FREE

== watcher_by "The man under the awning"
@on talk WATCHER
The man under the awning hadn't moved, and the cigarette still wasn't lit.
-> FREE


// --- Le Vauban -----------------------------------------------------------------

== vauban "Le Vauban"
@on enter vauban once
@ambient rain_in
@focus entrance
Le Vauban had been a hotel bar for a hundred and four years and a good one for about thirty of them.
Oak to the ceiling, brass to the knee, low lamps that made everyone look like a better version of a worse idea. Eleven stools, two of them taken: an old man in a beret with a Ricard, a big man in a blue jersey with a beer.
@focus bar_end
He'd stopped counting the exits years ago. These days he counted the people who counted them.
~ PERCEPTION medium: He'd stopped counting. His eyes hadn't. Three: the street, the hotel, and the door behind the bar for the staff.
A couple at the window table, talking low. A man in an armchair with a book. A barman with a cloth. A woman in the corner with a newspaper. A television above the till, talking to nobody.
@focus none
-> FREE


== mirror "The mirror"
@on look room_mirror once
The mirror behind the bottles had the whole street in it, backwards and gold. Across the road, under the awning of the closed pharmacy, a man in a dark coat was holding a cigarette he hadn't lit.
if heard_alone
  ~ INSTINCT: The man who wanted to be alone. From over there he has the door, the windows and the woman in the corner, and nobody inside has him.
elif met_watcher
  ~ INSTINCT: The man he offered a light. From over there he has the door, the windows and the woman in the corner, and nobody inside has him.
else
  ~ INSTINCT: A cigarette he won't light, in this rain. Either he's quitting, or he's waiting for a signal.
end
set room_mirror
-> FREE

== mirror_again "The mirror"
@on look room_mirror
if delorme_gone
  In the mirror, across the road, the man under the awning was still there, smoking now, the way men smoke when they've finished work and haven't been told they can go home.
else
  In the mirror, across the road, the man under the awning was still there, and still not smoking.
end
-> FREE


== corner "The woman in the corner"
@on look corner once
A woman in her fifties at the corner table: reading glasses, grey wool, a gin and tonic she hadn't touched. The Times, folded open at the crossword, pen uncapped.
The ice in the gin had melted to slivers, and she had not filled in a single square.
~ EMPATHY: Either that's the hardest crossword in the world, or she isn't doing it.
if not met_contact
  ~ FOCUS easy: The Times, open at the crossword. London said she'd have one. London didn't say she'd already be here, watching the door.
end
set corner
-> FREE

== corner_again "The corner table"
@on look corner
if met_contact
  The corner table was empty but for a gin nobody had drunk and a crossword nobody had done.
else
  She turned a page she hadn't read. The pen stayed uncapped.
end
-> FREE


== door "The door"
@on look door once
Wet footprints on the tiles from the street door, nearly dry: a woman's, small and certain, that went straight to the corner table and never came back. Nobody else's had had time to dry.
Nobody had come in out of the rain for a long while. Whoever else was in here had been here since before it started, or had come down from inside the building.
set door
-> FREE

== door_again "The door"
@on look door
His own prints had dried to nothing. Rain ran down the glass of the door in no hurry at all.
-> FREE


== coats "The coat stand"
@on look coats once
Two coats on the stand. A woman's grey raincoat, wet. And a camel overcoat, good cloth, perfectly dry, belonging to nobody in the room.
~ INSTINCT: A dry coat on a wet night. Its owner has been in the hotel all evening, and he isn't in here. Yet.
set coats
-> FREE

== coats_again "The coat stand"
@on look coats
if met_contact
  The grey raincoat had gone out into the rain with its owner. The camel overcoat hung on the stand by itself, dry as a bone.
else
  The grey raincoat and the camel overcoat, side by side on the stand. One wet, one dry as a bone.
end
-> FREE


== tv "The television"
@on look room_tv
if tv_off
  Dark now. In the black glass he could see the room behind him, and himself in it, which was somehow worse than the President.
else
  The new President of the Republic, on mute. He had a good face for television: handsome in a way that didn't frighten anyone, and serious in a way that did.
  The ticker crawled underneath him like a confession nobody was reading.
  @read news
  if speaks.fr >= 2
    ~ Salut public. The last people to put that on a government were the Terror.
  end
end
set room_tv
-> FREE


// r25: its pages are never read: the clerk keeps it turned to himself.
== guest_book "The guest book"
@on look guest_book
The hotel's guest book lay open on the desk: a heavy book with a ribbon, a fountain pen on a chain like a dog. It was turned to face the clerk, not the guests, and the clerk's forearm lay across the page as if by accident.
~ It's the one book in Paris this week that every side would like to read. The clerk knows it, and so does his arm.
-> FREE


// --- Things in the bar and the lobby (r22 BPLAY) ------------------------------

== matches "A bowl of matches"
@on look matches once
A brass bowl at the end of the bar full of matchbooks: LE VAUBAN in gold on oxblood, and the hotel's number on the back.
choose "They're there to be taken."
  * [Take one] "One won't be missed."
    give matchbook
    set has_light
  * silent [Leave them]
end
-> FREE

== matches_again "A bowl of matches"
@on look matches
if has.matchbook
  The bowl of matchbooks, as full as if nobody ever took one. He had one already.
else
  He took a book of matches from the bowl. Nobody minded; it's what they're for.
  give matchbook
  set has_light
end
-> FREE


== tip_jar "The tip jar"
@on look tip_jar
A jam jar by the till with a few coins in it and a strip of paper taped to the glass in the barman's hand.
[fr]: POUR LE CHAT
| 1: FOR THE CHAT
| 2: FOR THE CAT
| 3: FOR THE CAT
if speaks.fr >= 2
  There was no cat that he could see.
elif speaks.fr
  ~ For the chat. A tip for the conversation, then; in here, the barman earns it.
end
choose "The coins look lonely."
  * if money >= 2 and not tipped [Drop in two euros]
    pay 2
    The coins chimed. Down the bar, the barman lifted his cloth an inch, which in Le Vauban was a standing ovation.
    set tipped
    rel ANSELME +1
  * silent [Leave it]
end
-> FREE


== bar_paper "The evening paper"
@on look bar_paper once
Tonight's Le Quotidien, left folded on the oak, the President at his lectern on the front looking reasonable, and a headline across the top.
[fr]: RÉFÉRENDUM PAR DÉCRET
| 1: REFERENDUM ABOUT A DECREE
| 2: REFERENDUM BY DECREE
| 3: REFERENDUM BY DECREE
choose "Nobody seems to be reading it."
  * [Take it] "If nobody minds."
    @hide bar_paper
    give newspaper
    He folded it into the jacket. Paper is the last thing in a city like this that nobody is listening to.
  * silent [Leave it]
end
-> FREE

== bar_paper_again "The evening paper"
@on look bar_paper if not has.newspaper
The evening paper, still folded, still telling nobody about the referendum.
-> FREE


== bar_menu "The slate"
@on look bar_menu
A slate on the wall behind the bar. Ricard, four euros. Beer, seven. Islay whisky, sixteen, underlined, as if the barman wanted it known that he'd been asked.
if drink_scotch and not paid
  ~ Sixteen euros, then. London is paying for the evening; London will want a receipt.
end
-> FREE


== old_photo "A photograph of the bar"
@on look old_photo once
A framed photograph by the end of the bar, brown with age: Le Vauban in 1950 or so, the same oak and the same brass, full of men in hats. Behind the bar, a young man with a cloth.
~ EMPATHY medium: The same way of holding the cloth. The barman's father, or his grandfather; the bar has had one family's hands on it for seventy years.
set saw_photo
-> FREE

== old_photo_again "A photograph of the bar"
@on look old_photo
The young man behind the bar in 1950 went on holding his cloth the way the barman still did.
-> FREE


== radio "The radio"
@on look radio
A brown radio on the end of the bar, the kind with a real dial, turned down low.
if time >= 23:00 or time < 06:00
  The music had stopped. A man's voice read the evening's statement from the Élysée again, word for word, as if the words might have changed since nine.
  [fr]: « La nation reprend son souffle. »
  | 1: "The nation takes back its soufflé."
  | 2: "The nation is getting its breath back."
  | 3: "The nation is catching its breath."
  if speaks.fr >= 2
    ~ They're going to read it every hour until people stop hearing it.
  end
else
  An old chanson, a woman singing about a bridge and someone who didn't come. The barman hummed a bar of it and stopped when he caught himself.
end
-> FREE


== ashtray "An ashtray"
@on look ashtray
A glass ashtray on the middle table with one cigarette end in it: a papirosa, the Russian kind with a long cardboard tube, pinched flat twice at right angles.
~ MEMORY medium: Pinched like that by someone who learned to smoke in a queue somewhere east of here. Old habits travel well.
if speaks.ru
  ~ And he left it here, in a French bar, for anyone to see. Either careless or a calling card.
end
-> FREE


== plant "The potted palm"
@on look plant once
A potted palm in the corner behind the end of the bar, a little yellow at the edges.
~ PERCEPTION medium: The soil smells of aniseed. Somebody pours his Ricard into it, every night, so nobody sees him not drinking.
if heard
  set pours_drinks
end
-> FREE

== plant_again "The potted palm"
@on look plant
if pours_drinks
  The palm, yellowing at the edges, quietly drunk on aniseed.
else
  A potted palm, a little yellow at the edges.
end
-> FREE


== bottles "The back bar"
@on look bottles
Three shelves of bottles in front of the long mirror, every label turned out. Among the cognacs, one squat bottle of Islay with a cork stopper.
~ MEMORY: The same bottle as the bar at the embassy, in the year he was twenty-six. Somebody in this city still buys it for somebody.
-> FREE


== umbrella_stand "The umbrella stand"
@on look umbrella_stand once
A brass stand by the door with two umbrellas in it. One was a lady's, folded neat. The other was a big black one with a cane handle, beaded with old rain.
BARMAN (from down the bar): That one has been there a week, monsieur. If it rains on you, it is yours.
choose "It's still raining."
  * [Take the black umbrella] "Thank you. I'll bring it back."
    give umbrella
    BARMAN: Nobody ever does. That is how umbrellas travel.
  * silent [Leave it]
end
-> FREE

== umbrella_stand_again "The umbrella stand"
@on look umbrella_stand
if has.umbrella
  The lady's umbrella stood alone in the stand now, folded neat.
else
  The big black umbrella was still there, beaded with old rain.
  choose "If it rains on him, it's his."
    * [Take it]
      give umbrella
    * silent [Leave it]
  end
end
-> FREE


== till "The till"
@on look till once
An old brass till, and beside it a spike of the evening's chits, stabbed one on top of the other.
choose "The top ones are upside down to him."
  * white PERCEPTION challenging [Read the chits upside down]
    bonus +1 if pours_drinks "The Ricard in the palm"
    One chit had more lines than the rest, in the barman's square hand: Ch. 41, Ricard, Ricard, Ricard, eleven times since Tuesday, and never paid.
    if speaks.fr
      ~ Chambre quarante et un. A room upstairs, a Ricard every night, on the house's tab. And a palm tree drinking them.
    else
      ~ Forty-one: a room number, on a hotel bar's chit. A room upstairs, a Ricard every night, on the house's tab. And a palm tree drinking them.
    end
    set knows_room
  fail
    The barman moved down the bar, and the chits went behind his back with him.
  * silent [Leave it]
end
-> FREE

== till_again "The till"
@on look till
The brass till, the spike of chits. The barman's hand never far from either.
-> FREE


== key_board "The keys"
@on look key_board
Behind the clerk, the room keys hung on a board of brass hooks, each with a heavy brass weight so nobody walks off with one.
~ PERCEPTION medium: Six rows. Every hook full but one: forty-one. Whoever has room forty-one is in the building.
if heard
  set key_gone
end
if has_room
  ~ And twenty-three's, now, in his pocket.
end
-> FREE


== desk_bell "The bell on the desk"
@on look desk_bell
@sound desk_bell
A brass bell on the desk. He touched it, and it rang, a thin bright ping in the quiet lobby.
The clerk looked up from the guest book with the face of a man who has been rung for since 1987.
-> FREE


== paperback "A paperback"
@on look paperback once
A paperback left face down on the low table between the armchairs: a detective novel with its cover torn off, open at chapter nine. Someone had used a twenty-euro note as a bookmark.
choose "Twenty euros, folded once."
  * [Take the note] "Finders keepers."
    earn 20
    set took_twenty
    ~ Whoever it was will get to chapter ten and wonder where they put it. That's the kind of mystery that doesn't need a detective.
  * [Leave it] "Somebody's coming back for chapter ten."
    He left it where it was.
end
-> FREE

== paperback_again "A paperback"
@on look paperback
The detective novel, face down at chapter nine.
-> FREE


== cig_machine "The cigarette machine"
@on look cig_machine
A cigarette machine against the wall, oxblood red, its window lit: six brands nobody had heard of at six euros each.
if not has.cigarettes
  choose "He quit in Vienna."
    * if money >= 6 [Buy a packet of Corsaires] "One won't kill me. It's the others."
      pay 6
      The machine thought about it and dropped a blue packet into the tray with a sound like a door closing.
      give cigarettes
    * silent [Walk away]
      He walked away from it. It's what he'd been doing for eleven months.
  end
end
-> FREE


== fire_notice "The fire notice"
@on look fire_notice once
A framed fire notice by the stairs, with a little plan of the hotel in red ink: corridors, exits, the stairs. One arrow ran from the top floor down behind the bar, with a label beside it.
[fr]: Escalier de service : bar, étages
| 1: Service escalator: bar, stages
| 2: Service stairs: bar, floors
| 3: Service stairs: to the bar and every floor
if speaks.fr >= 2
  ~ The service stairs run from the top floor straight down to the bar, behind the staff door. A man upstairs could be on a bar stool without ever crossing the lobby.
  set knows_stairs
elif speaks.fr
  ~ A service escalator, from the bar to the stages. In a hotel this old, he doubted it, but he couldn't make the label say anything else.
end
-> FREE

== fire_notice_again "The fire notice"
@on look fire_notice
if knows_stairs
  The little red plan: the service stairs, coming down to the bar.
else
  The little red plan of the hotel, all arrows and French.
end
-> FREE


// r25: out of order all night. It can't be used: the button is dead.
== lift "The lift"
@on look lift
A lift with brass doors, and a card hung across them on a string.
[fr]: HORS SERVICE
| 1: OUTSIDE SERVICE
| 2: OUT OF SERVICE
| 3: OUT OF ORDER
Above them the needle of the floor dial had stopped between two floors.
@gesture BASED interact
@sound lift_button
He pressed the call button anyway. It went in, and stayed in, and nothing happened at all: no light, no hum, not a sound from the shaft.
if asked_lift
  ~ Been out since Tuesday.
else
  ~ INSTINCT: Out of order since when? A broken lift means everyone uses the stairs, and the stairs come down where someone can see them.
  if knows_stairs
    ~ Or not, if you know the other ones.
  end
end
-> FREE


// r25: the stairs are closed with a rope until the clerk has his key for
// him (the room's not made up: he's early). Then they're a door upstairs.
== stairs_closed "The stairs"
@on look stairs if not stairs_open
A red rope across the foot of the stairs, hooked between two brass posts, and a card hung from it in a careful hand.
[fr]: Clients : merci de vous adresser à la réception.
| 1: Clients: thank you for addressing yourselves to the reception.
| 2: Guests: please go to reception.
| 3: Guests: please ask at the desk.
if room_late
  ~ His key's on the board behind the clerk, and his room isn't made up yet. The clerk will unhook the rope when it is.
else
  ~ He has a room up there somewhere, booked to John Locke. The desk will know which.
end
-> FREE


== lilies "Lilies on the desk"
@on look lilies
A vase of lilies on the front desk, going brown at the edges, the water in the vase gone cloudy.
~ EMPATHY medium: Nobody's changed them since the election. Nobody's thrown them out, either. The whole city is like that this week.
-> FREE


== lobby_clock "The lobby clock"
@on look lobby_clock
if time >= 23:00 or time < 06:00
  The lobby clock said eleven and something, five minutes ahead of his watch.
else
  The lobby clock said ten and something, five minutes ahead of his watch.
end
~ It's always five minutes fast in hotels. They'd rather you were early for your train than late with the bill.
-> FREE


// --- The barman ----------------------------------------------------------------

== order "The barman"
@on talk BARMAN once
@actor BASED stool_end sit walk
@focus anselme
@figure BARMAN
The barman had been behind this bar a long time, and smiled at everyone. It was how he kept them from noticing that he listened.
BARMAN [fr]: Bonsoir, monsieur. Qu'est-ce que je vous sers ?
| 1: Good evening, monsieur. What is it that I serve you?
| 2: Good evening, monsieur. What can I serve you?
| 3: Good evening, sir. What can I get you?
choose "He waits, cloth in hand."
  * [A scotch] "A scotch. Islay, if you have one. No ice."
    BARMAN: Of course, monsieur.
    @sound glass
    @show glass_second
    set drink_scotch
  * [A beer] "Whatever you have on tap."
    BARMAN: Of course.
    @sound glass
    @show his_beer
    set drink_beer
  * [Just water] "Water. It's been a long day and it isn't over."
    BARMAN: A wise man. We do not get many.
    @sound glass
    @show water_glass
    set drink_water
end
@gesture BARMAN pick_up
set ordered
BARMAN: You are not from the hotel, I think. And not from the quarter. First time at Le Vauban?
choose "He's being friendly. He's also asking."
  * [First time] "First time. A friend said it was quiet."
    BARMAN: Your friend is right. Quiet is what we sell. The drinks are only so people have something to hold.
    rel ANSELME +1
  * white DECEPTION easy [The cover] "I'm in wine. I buy it for an importer in San Diego: buying, not drinking. Mostly."
    The barman's eyebrows told him that was the best joke he'd heard since the election, and that he would remember it.
    BARMAN: Then you must try the Bordeaux. It is terrible. You will buy none of it and feel very professional.
    set wine_cover
  fail
    The barman nodded the way a barman nods at a lie: politely, and for the record.
  * silent [Say nothing]
    He let the question go by. The barman let it, too. Thirty years behind a bar teaches you which silences are for filling.
end
-> tv_talk


== tv_talk "The television"
@figure BARMAN
Above the till, on mute, a man in a dark suit stood at a lectern with the tricolour behind him and said something that made the people around him applaud.
choose "The barman follows his eyes to the screen."
  * [Ask about the television] "What's he saying?"
    BARMAN: He is saying the Republic is tired. That it needs, how did he put it, a rest. Under supervision.
    BARMAN [fr]: Révision constitutionnelle de salut public.
    | 1: Constitutional revision of public greeting.
    | 2: A constitutional revision for public safety.
    | 3: A constitutional revision of public safety.
    BARMAN: The last time we had a Committee for public safety, they ran out of heads before they ran out of enemies.
    BASED: You don't sound like a man who voted for him.
    BARMAN (lightly): Nobody in Paris voted for him, monsieur. Ask anyone. And yet here he is.
    if knows_marchal
      ~ MEMORY: Forty-eight per cent for Marchal. Somebody in Paris voted for her, and then went home and was calm.
    end
    // r26 (the owner): he doesn't just say it. Mr. Based has to notice
    // something (Empathy, on the barman watching the screen), and then the
    // barman lets it out, reluctantly. Without the check, he doesn't learn
    // it here.
    On the screen the picture cut to the crowd behind the lectern: young men in dark jackets, applauding in time. The barman's cloth stopped on the glass.
    choose "The barman's cloth has stopped moving."
      * white EMPATHY medium [Watch him, not the screen]
        bonus +1 if saw_photo "The photograph by the bar: one family's hands on it"
        bonus +1 if rel.anselme >= 1 "He's warming to you"
        ~ EMPATHY: He isn't watching the President. He's going along the faces behind him, the young men in the dark jackets, one by one, and he's afraid he'll find one.
        choose "He hasn't noticed he's stopped polishing."
          * [Ask who he's looking for] "Somebody you know up there?"
            BARMAN: Up there? No, monsieur. Nobody.
            He put the glass down, and picked it up again, and looked at it as if it had answered back.
            BARMAN (quietly): My grandson. He joined them in the spring. Their Volunteers.
            set heard_grandson
            BASED: That can't be easy.
            BARMAN: He is nineteen, and very serious, and he thinks he is saving France. At nineteen I thought the same, only about a girl.
            choose "He seems almost relieved to have said it."
              * [Ask about the boy] "What do they have him doing?"
                BARMAN: Handing out their papers. Standing at the back of their meetings, where people can see him standing. They give them a little pin. An oak leaf, bronze. Like the generals have on their caps.
                BARMAN: He wears it on the inside of his lapel, so his grandmother won't see.
                ~ MEMORY: An oak leaf on the inside of a lapel. Worth remembering.
                set knows_oak
                rel ANSELME +1
              * silent [Let it go]
                BARMAN: You did not hear that from me, monsieur. Not even my wife has heard it from me.
                The barman's cloth found the glass again. Some things a man says to a stranger so that the stranger will leave them alone.
            end
          * silent [Leave him to it]
            Whatever he was looking for up there, he could look for it in peace.
        end
      fail
        ~ EMPATHY: Something on the screen has spoiled his evening, something more than the President. Whatever it is, he's keeping it behind the bar.
      * silent [Watch the screen]
        The young men applauded in time until the picture went back to the lectern, and the barman's cloth went back to the glass.
    end
  * silent [Let him watch]
    They watched the President applaud himself together, the way strangers watch a fire.
end
choose "The President goes on applauding himself."
  * [Turn it off] "Do me a favour and turn him off."
    The barman found the remote in his apron and pointed it at the President with the expression of a man who had been waiting all evening for someone to ask.
    @sound tv_off
    @news none
    set tv_off
    rel ANSELME +1
  * silent [Leave it on]
    He let the man on the screen keep talking to nobody. It seemed only fair. The whole country had been doing it for eleven days.
end
@figure none
The barman went off to polish something at the far end of the bar.
@actor BARMAN behind_bar_far walk lean
-> reverie


// --- Waiting -------------------------------------------------------------------

== reverie "Waiting"
@focus glasses
@vignette none
@figure none
if thoughts >= 2
  -> stranger
end
choose "Ten o'clock came and went. Where does his mind go?"
  * once [The phone in his jacket] -> t_phone
  * once [His left hand] -> t_scar
  * once [The rain] -> t_rain
  * [Back to the room] -> stranger
end


== t_phone "The British"
@vignette london
The phone in his jacket had one number in it, and the number was a code London had given him.
Four days ago a man with a good tie and a bad cold had bought him lunch at a club off Pall Mall and spent an hour not asking him anything.
"We'd like to know what our neighbours are planning," he'd said at last, over the cheese. "And we would very much prefer it not to be us who asks."
~ Deniable. The most British word there is. If it goes wrong, you were never here. If it goes right, neither were you.
They hadn't asked why he'd left Langley. That was how he knew they'd read the file. People only stop asking when they think they already know.
boost INSTINCT +1 "What the British didn't ask"
set thought_phone
add thoughts 1
-> reverie


== t_scar "His left hand"
@vignette vienna_bridge
There was a white line across the knuckles of his left hand, thin as a hair. It went pink when he was cold.
A car window in Vienna, on a night in February. The engine running, the glass not breaking the way it does in films, and out on the bridge behind him a man he had promised to bring across, still walking towards a car that was already leaving.
~ He'd done the arithmetic in the time it takes a window to break. He has been doing it again ever since, and it always comes out the same.
He had given the Agency seventeen years. They gave him a commendation, a pension and a polygraph, in that order, and only the polygraph ever asked the right question.
He left a month later. Langley let him go the way you let go of something hot: quickly, and without looking at it.
boost ENDURANCE +1 "Vienna, looked at"
set thought_scar
add thoughts 1
-> reverie


== t_rain "The rain"
@vignette rain_window
He'd been twenty-six the first time he saw Paris: a junior political officer at the embassy on the avenue Gabriel, with a cover so thin you could have read a newspaper through it.
He had loved the city the way you love things at twenty-six. Completely, and for the wrong reasons.
~ The city hasn't changed. That's the trouble with cities. They let you think it was you.
Outside the rain found the gutters, and the gutters found the Seine, and the Seine went where it had always gone: west, and out, and eventually to the sea, and England.
boost CHARISMA +1 "Paris at twenty-six"
set thought_rain
add thoughts 1
-> reverie


// --- The man in grey -----------------------------------------------------------

== stranger "The man in grey"
@vignette none
@focus bar_end
@actor BARMAN behind_bar_far lean
Le Vauban had eleven stools, and most of them were empty.
@actor STRANGER lobby
The man in the grey suit came in from the hotel lobby, not the street, and took the one next to his.
@actor STRANGER stool_10 sit walk
@show umbrella
@figure STRANGER
STRANGER [fr]: Un Ricard, Anselme.
| 1: One Ricard, Anselme.
| 2: A Ricard, Anselme.
| 3: A Ricard, Anselme.
set heard_anselme
@show stranger_glass
He said it without looking at the bottles, and the barman poured it without being asked which. He sat close enough that their elbows almost touched on the oak. Close enough to be rude, or friendly, or neither.
choose "He's too close."
  * [Move a stool along] "Plenty of room tonight."
    @actor BASED stool_8 sit walk
    @hide glass_second
    @hide his_beer
    @hide water_glass
    @show glass_second_b
    He moved one stool along, taking his glass with him.
    STRANGER (amused): Americans. You need so much space. It's the size of your country. It gets into you.
    ~ PERCEPTION: He heard the accent in four words. He'll have heard plenty of Americans this week; the embassy's been busy.
    set moved_away
  * [Stay where you are]
    He stayed where he was. If a man wanted to sit close to him, he could find out what that was like.
    set stayed_close
  * silent [Ignore him]
    He didn't look up. The man in grey seemed to enjoy that.
    set stayed_close
end
-> read_stranger


== read_stranger "Read him"
@figure none
if moved_away
  @focus stranger_close_b
else
  @focus stranger_close
end
He didn't turn his head. He didn't need to. The mirror and the corner of his eye had been enough for seventeen years.
investigate "Read the man in grey" min=3 leave="Enough" still
  spot umbrella "His umbrella"
    A black umbrella hooked on the brass rail. Furled tight, the strap snapped shut. Bone dry.
    if coats
      ~ And that will be his camel coat on the stand. He's been upstairs all evening.
    end
  spot shoes "His shoes"
    Black Derbys polished to a mirror, on thick rubber soles that didn't belong to the shoes. The kind of sole you buy when you spend your days standing, and some of your nights running.
  spot ring "His left hand"
    When he loosened his tie he showed a pale band on the fourth finger, where a ring usually lived.
    ~ EMPATHY: He took it off to come to work. Men take their rings off for two reasons, and he doesn't smell of perfume.
  spot lapel "His lapel"
    When he leaned for a menu he didn't need, his lapel turned over. On its underside was a small bronze pin in the shape of an oak leaf.
    // r26: he knows it for the party's only if he noticed the leaf on the
    // posters (saw_oak_emblem), or Anselme told him.
    if knows_oak
      ~ MEMORY: The barman's grandson wears one of those. Le Serment's Volunteers.
    elif saw_oak_emblem
      ~ MEMORY: The party's oak leaf, the one in the corner of every poster in the street, worn where only somebody looking for it would find it. Which means it's meant for people who know to look.
    elif flyer
      ~ MEMORY: The oak leaf off the Volunteers' leaflet in the gutter, worn where only somebody looking for it would find it. Which means it's meant for people who know to look.
    else
      ~ MEMORY: A little bronze oak leaf, worn where only somebody looking for it would find it. Which means it's meant for people who know to look.
    end
  spot order "His drink"
    He'd ordered without looking at the bottles, and the barman had poured without being told which. A regular, then, of a bar he doesn't like: he hasn't touched it.
  spot his_mirror "The mirror"
    if room_mirror or met_watcher or saw_watcher
      In the mirror, across the street, the man under the pharmacy awning had finally lit his cigarette.
    else
      In the mirror, across the street, a man under a pharmacy awning lit a cigarette, as if he'd just been told he could.
    end
    ~ INSTINCT: So that's the signal. The man in grey is in place, and the street knows it.
  deduce came_down "He was already in the building" needs=umbrella,shoes skill=FOCUS diff=challenging
    bonus +2 if coats "The dry camel coat on the stand"
    bonus +1 if door "Nobody came in from the street"
    bonus +1 if knows_stairs "The service stairs come down into the bar"
    bonus +1 if key_gone "Forty-one's key isn't on its hook"
    Dry umbrella, dry shoulders, dry shoes. He hadn't come in out of the rain. He'd come down from a room upstairs.
    if coats
      ~ Where he lives, by the look of the dry camel coat on the stand.
    end
  fail
    ~ FOCUS: Dry shoes, a dry umbrella. A taxi to the door, perhaps. Perhaps.
  deduce party_man "Not police. Party." needs=shoes,lapel skill=MEMORY diff=challenging
    bonus +2 if knows_oak "The barman's grandson's pin"
    bonus +1 if saw_oak_emblem "The oak leaf on the posters"
    bonus +1 if flyer "The Volunteers' leaflet"
    bonus +1 if saw_moped "The oak leaf on the moped"
    A policeman's soles and a bronze oak leaf. Not the Préfecture's man, then, and not the DGSI's.
    ~ The party has its own people now. Of course it does. They always do, just before they stop needing the police.
  fail
    ~ MEMORY: Rubber soles and a little bronze pin. Somebody's man. Whose, it won't say.
  deduce on_duty "He's on duty, and not for me" needs=order,ring skill=EMPATHY diff=challenging
    bonus +1 if pours_drinks "The palm that drinks his Ricard"
    He took his ring off to come to work, and his work is this room. Every night. I've been in Paris four days: whatever he's watching, it was here before me.
    ~ Then what? The bar, the hotel, the street. Or somebody in it.
  fail
    ~ EMPATHY: The ring, the drink. Two coincidences. Probably.
end
-> talk


== talk "The man in grey"
if moved_away
  @focus two_at_bar_b
else
  @focus two_at_bar
end
@figure STRANGER
STRANGER: Terrible weather for tourists.
STRANGER: Forgive me. I'm here most evenings, and I know every face at this bar. Yours is new.
His English was very good. London good: a year or two at one of those schools that teach you to sound as if you'd never had to learn it.
~ LANGUAGES challenging: Westminster, then Sciences Po. The vowels of a man who learned his English from people who owned things.
choose "He smiles at the mirror, not at him."
  // r26: one cover, the same to everyone: John Locke (the passport London
  // made him), a buyer for a wine importer in San Diego, over for the
  // tastings.
  * [The cover] "I buy wine, for an importer in San Diego. I'm over for the tastings."
    STRANGER (amused): In this bar? Then you are either a very bad buyer or a very good one. I will decide later.
    set wine_cover
    set told_grey_wine
    rel DELORME +1
  * white INTIMIDATION challenging if came_down and party_man [Call him out] "You came down from upstairs, and you've a party pin under your lapel. Who are you watching?"
    bonus +2 if came_down "He came down from upstairs"
    bonus +1 if party_man "His oak-leaf pin"
    bonus +1 if on_duty "He's on duty"
    For a moment the man in grey had nothing to say at all. Then he smiled, properly this time, as if he'd been handed a present he hadn't expected.
    STRANGER: You have very good eyes for a tourist. I will remember them.
    set called_out
    rel DELORME -1
    remember DELORME
  fail
    The man in grey let it go past him like a waiter with someone else's order.
    STRANGER (mildly): You've been reading novels, monsieur. In novels the man at the bar is always a spy. In life he is usually a dentist.
  * silent [Say nothing]
    He drank, and said nothing, and let the man in grey fill the silence. People nearly always did. This one took nearly a minute, which was a kind of compliment.
end
STRANGER: Tell me, monsieur. Do you like France?
choose "He seems to want an answer." timer=10
  * [I like Paris] "I like Paris. I'm still making up my mind about France."
    STRANGER: So is France. That's what elections are for.
  * [The wine is good] "The wine's very good."
    STRANGER: The wine is the only thing in this country that has never needed reforming.
  * silent [Say nothing]
    STRANGER: Wise. It's a trick question this week.
end
STRANGER: The new President thinks France has spent fifty years apologising. To the Germans, to the English, to Brussels, to everyone. He thinks it's time we stopped.
STRANGER: I happen to agree with him. Most people do, though they would never say so in a bar like this one.
if tv_off
  He glanced at the dark television above the till, and smiled as if it had told a joke.
end
-> name


== name "A name"
@figure STRANGER
STRANGER: We haven't been introduced. I like to know who I'm drinking next to.
choose "He waits for a name."
  // r26: the owner: an option to give him the alias.
  * [Give him your alias] "John Locke."
    STRANGER (amused): John Locke. Like the philosopher. Then you believe in contracts, Monsieur Locke.
    BASED: Only the ones that pay on time.
    ~ INSTINCT: The name on the booking, on the passport, on the label of the bag upstairs. Let him check it. London made it to be checked.
    set gave_alias
  * [Give him your real name] {give-him-yours} "Based."
    STRANGER: Based. Like the wine region. Bah-zay.
    He said it the French way, which made it sound like somewhere you'd go for the weekend instead of something a man had to write on forms.
    ~ INSTINCT: Now he has it. Men like him don't ask for things they don't mean to keep.
    set gave_name
  * white DECEPTION medium [Keep it to the trade] "In the wine trade, names come with the second bottle."
    bonus +2 if told_grey_wine "A wine buyer already"
    STRANGER (amused): Then I will buy the second bottle another night.
    He let it go, or let it go far enough to stop asking, which in Paris this month came to the same thing.
    set wine_cover
    set told_grey_wine
    set kept_name
  fail
    STRANGER (smiling): A wine buyer who keeps his name in the cellar. How very discreet.
    ~ DECEPTION: Too neat. A man with nothing to hide just says it.
    set wine_cover
    set told_grey_wine
  * silent [Say nothing]
    STRANGER: A man with no name in a bar where nobody talks. How very romantic.
end
@figure DELORME
DELORME: Delorme. It isn't, of course. But it's the one I brought with me, and it would be a shame to waste it.
set knows_delorme
DELORME: If you need anything in Paris, monsieur, the hotel knows where to find me. Paris is a little complicated just now, for visitors.
if moved_away
  @show card_b
else
  @show card
end
He laid a card on the oak between them, plain white, a few words on it in blue ink, and stood.
-> goodbye


== goodbye "On his way"
DELORME [fr]: Bon courage, monsieur.
| 1: Good courage, monsieur.
| 2: Good luck, monsieur.
| 3: Keep your chin up, monsieur.
if stayed_close
  He put a hand on Based's shoulder on his way past, briefly, the way Frenchmen do.
  ~ PERCEPTION medium: And on the way past, a look at the corner table. Half a second. It was the only thing he'd looked at all night that he hadn't pretended not to.
  set saw_the_look
else
  @actor BARMAN behind_bar_far walk lean
  DELORME [fr]: Anselme, un mot.
  | 1: Anselme, one word.
  | 2: Anselme, a word.
  | 3: Anselme, a word.
  He stopped at the far end of the bar and said something to the barman, low and quick.
  set delorme_word
  // r26: said low: at 2 points he loses some of it; only at 3 all.
  DELORME [fr]: L'Américain. Tu ne le connais pas ? Préviens-moi s'il revient.
  | 1: The American. You don't know him? Prevent me if he... comes back?
  | 2: The American. You don't know him? ... if he comes back.
  | 3: The American. You don't know him? Let me know if he comes back.
end
@figure none
@actor STRANGER lobby_far walk
@hide umbrella
@hide stranger_glass
He went out the way he'd come, into the hotel and not the street, and the bar was quiet again.
set delorme_gone
-> contact


// --- London's contact ----------------------------------------------------------

== contact "The woman in the corner"
@actor STRANGER none
@focus corner
Two minutes after the man in grey had gone, the woman in the corner folded her newspaper, finished nothing, and came to the bar.
@actor WOMAN stool_10 sit walk
@hide gin_table
@show gin_bar
if moved_away
  @focus two_at_bar_b
else
  @focus two_at_bar
end
@figure WOMAN
She took the man in grey's stool, as if it had been kept for her, and laid The Times on the oak, open at the crossword.
choose "She orders nothing."
  * [Ask about seven down] "Is seven down 'tenterhooks'? I've been on them all evening."
    WOMAN: It's 'pins and needles'. Tenterhooks is eleven across, and it doesn't fit.
    ~ The answer London gave him, word for word. She even sounds bored by it, which is the hardest part to teach.
    rel PENHALLOW +1
  * silent [Wait for her]
    He waited. She let him, and seemed to approve, and then gave up waiting first.
    WOMAN: You're meant to ask me about seven down, Mr. Based. It's in the instructions. They were very short.
    ~ EMPATHY medium: She's been saving that line for forty minutes. She's pleased with it.
end
@figure PENHALLOW
PENHALLOW: Penhallow. I'm the one who argued against hiring you. I lost, which is why I'm here and not somewhere warm.
PENHALLOW: I thought you should know that. I find it's healthier to start where we are.
set met_contact
task contact done
-> vienna


== vienna "February"
@figure PENHALLOW
PENHALLOW: London has your file. The parts Langley let us see. It's very complete, apart from a hole about the size of a Viennese winter.
if thought_scar
  Without meaning to, he had put his left hand flat on the oak, scar up. He took it off again.
end
choose "She lets it sit there." timer=10
  * [February's a short month] "February's a short month. It doesn't take long to fall into."
    PENHALLOW: That's not an answer.
    BASED: It wasn't a question.
  * [Mind your own business] "Then London should mind the hole. Holes are what it's hired me for."
    PENHALLOW (dryly): London minds everything, Mr. Based. It's our national sport. We're very bad at all the others.
    rel PENHALLOW -1
  * silent [Say nothing]
    He looked at his glass, and said nothing, and she watched him do it.
    PENHALLOW: All right.
end
-> briefing


== briefing "What London fears"
@figure PENHALLOW
PENHALLOW: Here's what we have. It isn't much, which is the point of you.
-> questions


== questions "Questions"
@figure PENHALLOW
choose "What does he ask her?"
  * once [What London is afraid of] "Start with what keeps London up at night."
    PENHALLOW: Article Sixteen. Their constitution lets a president take emergency powers when the Republic is under "grave and immediate threat." Montclar's people have been drafting the threat.
    PENHALLOW: Tonight he called it a constitutional revision of public safety. A referendum by decree, the Assembly suspended "while the nation catches its breath." London thinks the breath will be a long one.
    -> questions
  * once [What the army is doing] "Speeches are cheap. What's the army doing?"
    PENHALLOW: Seventeen thousand men in the Moselle on an exercise nobody announced, forty kilometres from the German border. Brest has stopped answering the phone. And the harbourmaster on Jersey counted four French patrol boats last week, where there's usually one and it's lost.
    BASED: Germany or England.
    PENHALLOW: Or both, or neither. That's the trouble with a man who's just discovered he can do anything. He hasn't decided yet what anything is.
    set knows_army
    -> questions
  * once [What CLOVIS is] "London's message said Clovis. Who's Clovis?"
    PENHALLOW: A word. It turned up in a cable from the Élysée to the Ministry of the Armed Forces, and then it stopped turning up anywhere, which is how we know it matters.
    PENHALLOW: Clovis was the first king of the Franks. He united them by killing everyone who disagreed, and then the Church baptised him for it.
    PENHALLOW: Whether CLOVIS is a constitution or a war, nobody knows. Finding out is your job.
    set knows_clovis
    -> questions
  * once [Why me] "Why not one of your own?"
    PENHALLOW: Because you're not us. If you're caught, you're an American with a drink problem and a grudge against his old employer, and nobody in Paris will find that hard to believe.
    PENHALLOW: And because, apparently, you're the best there is. The man who hired you was very insistent. I'm reserving judgement.
    if thought_phone
      BASED: The man with the cold.
      PENHALLOW: He has a name, which I won't tell you, and a cold, which he gave to me.
    end
    -> questions
  * [That's enough] "I've heard enough."
end
PENHALLOW: Now. The man in grey.
-> the_question


// r25: what he tells her about the man in grey is only what he noticed.
// Two telling things (where the man came from, his pin, the signal in the
// mirror, that he's on duty in this room, his look at her table, which
// counts for two) and together they work out that he was watching her and
// has now seen them together: they both have to disappear (knew_seen).
// Fewer, or nothing, or nothing he'll share, and they can't make anything
// of him (missed_watch): see contact_nothing.
== the_question "The question"
@figure PENHALLOW
PENHALLOW: I couldn't hear him. I could see him. What did he want?
choose "Penhallow is watching his hands." timer=12
  * [Tell her] "He wanted to know who I was. A new face at his bar, he said. He knows every face in it."
    PENHALLOW: Delorme. He's had a room here since the election. We assumed he was watching the hotel.
    set told_penhallow
    rel PENHALLOW +1
    remember PENHALLOW
    if came_down or lapel or his_mirror or on_duty or saw_the_look or shoes or order or coats
      -> tell_her
    end
    -> contact_nothing
  * [Keep it to yourself] "He wanted to know if I liked Paris. I told him it rains too much."
    PENHALLOW: Funny. From where I was sitting it looked like he gave you his card.
    She let him hear how little she believed him, and then she let it go, which was worse.
    PENHALLOW: Have it your way, Mr. Based. I'm sure you know best.
    set kept_quiet
    set missed_watch
    rel PENHALLOW -2
    remember PENHALLOW
  * silent [Say nothing]
    He said nothing. Penhallow looked at the card on the oak and drew her own conclusions. She looked like a woman who drew them for a living.
    PENHALLOW: Fine. Keep your secrets. Just make sure they're worth what we're paying for them.
    set kept_quiet
    set missed_watch
    rel PENHALLOW -1
end
-> parting


== tell_her "What he noticed"
@figure PENHALLOW
choose "What else does he tell her?"
  * once if came_down [Where he came from] "He didn't come in out of the rain. Dry umbrella, dry shoes. He came down from upstairs."
    PENHALLOW: From his room, then. He's never once come in by the street door, not while I've been here.
    add told_telling 1
    -> tell_her
  * once if lapel and party_man [His pin] "There's an oak-leaf pin under his lapel. Not the Préfecture's man. The party's."
    PENHALLOW: The party's own. That's worse. The Préfecture at least has rules.
    add told_telling 1
    -> tell_her
  * once if lapel and not party_man [His pin] {his-pin-leaf} "There's a little bronze oak leaf under his lapel. Worn where you'd have to look for it."
    PENHALLOW: The party's leaf. Their young men wear it like that, on the inside, for each other.
    add told_telling 1
    -> tell_her
  * once if his_mirror [The man under the awning] "When he sat down, the man under the pharmacy awning lit his cigarette. As if he'd been told he could."
    PENHALLOW: He's been under that awning every night I have. I took him for a man waiting for a girl.
    add told_telling 1
    -> tell_her
  * once if on_duty [He's working] "He took his ring off to come to work. His work is this room."
    PENHALLOW: Every night. The same stool, the same Ricard, and he never drinks it.
    add told_telling 1
    -> tell_her
  * once if saw_the_look [His look at your table] "On his way out he looked at your table. Half a second. The only thing all night he didn't pretend not to look at."
    She didn't look at her table. She looked at him.
    add told_telling 2
    -> tell_her
  * once if shoes and not came_down [His shoes] "Good shoes, on a policeman's soles. He stands all day, and runs some nights."
    PENHALLOW: Half of Paris has those soles this month.
    -> tell_her
  * once if order and not on_duty [His drink] "He ordered without looking at the bottles. A regular. He hasn't touched it."
    PENHALLOW: He never does.
    -> tell_her
  * once if coats and not came_down [The camel coat] "There's a camel coat on the stand, bone dry. His, I'd say."
    PENHALLOW: Then he wasn't out tonight.
    -> tell_her
  * [That's what I have] {thats-what-i-have}
    if told_telling >= 2
      -> worked_out
    end
    -> contact_nothing
end


// What he noticed adds up: the man was watching her, and has seen them.
== worked_out "Seen"
@figure PENHALLOW
if saw_the_look
  BASED: He wasn't watching the bar. He was watching you.
else
  BASED: Put it together. He isn't here for the bar, or the hotel. He's watching you.
end
She was quiet for a while.
PENHALLOW: Three nights I've sat in that corner, and three nights he's sat on that stool. I took him for the furniture.
PENHALLOW: Then I'm blown, and you've been seen with me. That's a very bad start, Mr. Based. I want you to notice I'm not blaming you for it.
set she_is_blown
set knew_seen
~ He's seen them together now, at his bar, in his mirror. Whatever London wanted from this, it isn't going to get it with these two faces.
PENHALLOW: So we do the only thing there is. I go out of that door, and tomorrow I'm somebody else, in another city. You go up to bed like a wine buyer with nothing on his mind but tomorrow's tastings, because that's what one would do. Running now would tell him everything.
PENHALLOW: And you're out of here before breakfast. After tonight, neither of us was ever in Le Vauban.
BASED: Never seen again.
PENHALLOW: It's the one thing London is really good at.
-> parting


// r25: when he noticed nothing, or not enough to put it together. The
// owner's answer (option B, a different outcome): she remarks on the man in
// grey in passing, nothing too pointed (every night this week, always the
// same seat); he seems a little off, but neither of them can make anything
// of it, because Mr. Based has nothing to add. They don't work out that he
// was watching her, or that he's seen them together, and they part
// thinking it went all right (missed_watch). Part two pays it off.
== contact_nothing "The man in grey"
@figure PENHALLOW
PENHALLOW: He's been here every night this week, you know. Always the same seat.
BASED: Every bar has one.
PENHALLOW (lightly): Every bar has one. Usually he's seventy and tells you about his knee.
She glanced at the stool the man had left, and then at her crossword, as if one of them might come out.
~ Something about the man in grey sat wrong, like a picture an inch off level. He couldn't have said what, and neither, by the look of her, could she.
PENHALLOW: Well. Nothing either of us can do anything with tonight. Be a wine buyer for a few days. Taste things. Be boring. You'd be amazed how well it works.
set missed_watch
-> parting


== parting "London's contact"
@figure PENHALLOW
She put a note under the gin she hadn't drunk and stood.
PENHALLOW: You have a number. Use it sparingly. It's expensive, and so am I.
@figure none
@actor WOMAN street_cross walk in=street
@sound bar_bell
if knew_seen
  The door's bell rang once behind her. In the mirror he watched her cross the street without looking at the man under the awning, who didn't look at her, which told him everything about both of them.
else
  The door's bell rang once behind her. In the mirror he watched her cross the street in the rain, past the man under the awning, and out at the mirror's edge.
  ~ A first meeting, and nobody arrested. In Paris this month that counts as going well.
end
task clovis "Find out what CLOVIS is. A word in a cable from the Élysée to the Ministry of the Armed Forces, and then nowhere."
if knew_seen
  task delorme "The man in grey was watching Penhallow, and saw the two of them together. Out before breakfast, and never seen at Le Vauban again."
else
  task delorme "Find out who the man in grey is. He's at the bar every night, always in the same seat, and the hotel knows where to find him."
end
@weather changing
@focus none
~ ENDURANCE: And now the long day caught up with him, all of it at once: the flight, the rain, the waiting. He wanted a bed more than he wanted anything London could give him.
task sleep "Get his key from the desk and go up to bed. The lift's out: the stairs, then."
-> FREE


// --- After the meeting: the bar, the hotel, the street ------------------------

== card_look "The card"
@on look delorme_card once if delorme_gone
@hide card
@hide card_b
@gesture BASED pick_up
He picked up the card. Plain white, good stock. On one side, in blue ink: Delorme, and the hotel's number. On the other, nothing.
~ FOCUS medium: Blue ink, a fountain pen, a man who writes the way he was taught at school. And the hotel's number, not his own. He wants me to come here to find him.
give delorme_card
set took_card
-> FREE


== anselme_after "The barman"
@on talk BARMAN once if met_contact
@figure BARMAN
The barman came down the bar with his cloth, which was how he said he was listening.
BARMAN: Another, monsieur? Or the bill? At this hour they are the same thing.
BASED: What's your name?
ANSELME: Anselme.
set anselme_named
@figure ANSELME
choose "Anselme waits, polishing."
  * white CHARISMA medium if delorme_word [Ask what the man in grey wanted] "The gentleman in grey had a word with you. Anything I should know?"
    bonus +1 if rel.anselme >= 1 "He likes you"
    bonus +2 if rel.anselme >= 2 "He's decided he likes you"
    Anselme looked at the far end of the bar, where there was nobody, and lowered his voice anyway.
    ANSELME: He asked if I knew you. I said no, which was true. He asked me to telephone him if you came back.
    ANSELME: I will not, of course. But you should know I was asked.
    set anselme_told
    rel ANSELME +1
  fail
    ANSELME (lightly): He wanted a Ricard, monsieur. He always wants a Ricard.
  * if saw_photo [Ask about the photograph] "The photograph by the bar. Your father?"
    // r26: the grandson isn't in it any more (the owner: S96.22, S96.24).
    ANSELME: Nineteen fifty-one. He had the bar from his uncle and gave it to me.
    ANSELME: He kept the Germans' money in a separate drawer, monsieur, and gave it to the Resistance on Thursdays. It was a very good bar for a long time.
    rel ANSELME +1
  * [Pay the bill] "The bill, then."
    Anselme wrote it on a scrap of paper and laid it on the oak face down, as if it were bad news.
    if drink_scotch
      pay 16
    elif drink_beer
      pay 7
    end
    set paid
    rel ANSELME +1
  * silent [Say nothing]
    Anselme let the silence be, and went back to his glasses.
end
@figure none
-> FREE

// r25: by his name only once he's given it (a save from before may not
// have it: then he's the barman, as he was).
== anselme_idle "The barman"
@on talk BARMAN
if anselme_named
  @figure ANSELME
  if anselme_told
    ANSELME: He asked, monsieur. I said nothing. You heard nothing. We are both very discreet.
  elif tv_off
    ANSELME: You see? Without the President it is almost a nice evening.
  else
    ANSELME: He is still talking. They will have to switch off the whole country to stop him.
  end
else
  @figure BARMAN
  BARMAN: Monsieur?
end
choose "The barman polishes a glass that was clean already."
  * if not has.matchbook [Ask for a light]
    BARMAN: A light? Take a box, monsieur. Take two. They are the only thing in Paris that is still free.
    give matchbook
    set has_light
  * if not paid and (drink_scotch or drink_beer) [Pay what you owe]
    The barman wrote the bill on a scrap of paper and laid it face down.
    if drink_scotch
      pay 16
    else
      pay 7
    end
    set paid
  * silent [Leave him to it]
end
@figure none
-> FREE


// She can only be found before he orders: after that she comes to him, and
// then she's gone (out of the bar, and off the street).
== woman_early "The woman in the corner"
@on talk WOMAN
She didn't look up from her crossword.
choose "The Times, open at the crossword."
  * [Ask about seven down] "Is seven down 'tenterhooks'?"
    She filled in a square for the first time all evening, with a word he couldn't see.
    WOMAN (quietly): Not here. Not yet. Order a drink like a normal person, Mr. Based. I'll come to you.
    ~ EMPATHY medium: She looked at the door to the lobby before she answered. Not at me. At the door.
    set tried_parole
  * silent [Leave her to it]
    He left her to her crossword.
end
-> FREE

// --- The desk (r25) ------------------------------------------------------------
// The clerk keeps the guest book turned to himself and the stairs roped:
// since the Préfecture's circular a hotel must know who goes up, so a guest
// takes his key at the desk and the clerk unhooks the rope for him. London
// booked Mr. Based a room under his alias, John Locke, and he's early:
// it isn't made up yet. After the bar (the man in grey, then London's
// contact) it's ready, and the stairs are his.

== clerk_first "The desk clerk"
@on talk PORTER once if not met_contact
@actor BASED see_desk walk
@focus desk
// r26: the call is in French (the owner), fast and low and hard to follow:
// all of it only at 3 points; at 2 the car at six but not where; at 1 a
// muddle; at 0 nothing.
The clerk was on the telephone, talking fast and low in French with the receiver in the crook of his shoulder. His other hand lay flat on the guest book.
PORTER [fr]: Le quarante et un demande une voiture pour six heures. Oui. Pour Satory. Comme d'habitude.
| 1: The forty... one? Asks for a car for six people. Yes. For Sat-something. Like the habit.
| 2: Forty-one wants a car for six o'clock. Yes. To... a place he didn't catch. As usual.
| 3: Forty-one wants a car at six. Yes. To Satory. As usual.
if speaks.fr >= 2
  set heard_41
  set knows_car
end
if speaks.fr >= 3
  set knows_satory
  ~ MEMORY medium: Satory. The army's ground south of Versailles: the tanks, the testing range, the generals' lunches. A strange place to take a man at six in the morning.
end
He put the phone down and turned the smile on.
PORTER: Monsieur? You have a reservation?
BASED: There should be a room for John Locke. I buy wine, for an importer in San Diego.
The clerk turned a page of the guest book with one finger, keeping it to himself, and found the name without having to look for long.
PORTER: The wine gentleman. Yes, monsieur: twenty-three, on the second floor. But you are early, and it is not made up. Feel free to wait in the bar; it should only take about an hour.
set room_late
He tilted his head at the red rope across the foot of the stairs.
PORTER: And until you have your key I cannot let you up, I am afraid. The Préfecture's circular: a hotel must know who goes up, so the stairs are for guests with a key. I will have your key when the room is ready.
~ An hour in a bar he'd been sent to sit in anyway. London's arithmetic, for once.
task room "His room, twenty-three, booked to John Locke, isn't made up yet. The clerk has the key, and the rope across the stairs."
@focus none
-> clerk_ask

== clerk_ready "The desk clerk"
@on talk PORTER once if met_contact
@actor BASED see_desk walk
@focus desk
if room_late
  PORTER: Monsieur. Twenty-three is ready.
else
  PORTER: Monsieur? You have a reservation?
  BASED: There should be a room for John Locke. I buy wine, for an importer in San Diego.
  The clerk turned a page of the guest book with one finger, keeping it to himself.
  PORTER: The wine gentleman. Twenty-three, monsieur, on the second floor. Made up an hour ago.
end
@sound key
He took a key on a heavy brass weight from the board behind him and laid it on the desk so that it didn't ring.
set has_room
give his_key
task room "Room twenty-three, on the second floor. The key's in his pocket."
@actor PORTER rope_spot walk
PORTER: The lift, I am afraid, is a lift in name only. But the stairs are fine to take, monsieur. Second floor, on the left.
@focus stairs_rope
He came round the desk to the foot of the stairs, unhooked the red rope from its post and let it hang, the card turned to the wall.
@gesture PORTER interact
@sound rope
@hide stair_rope
@show stair_rope_down
set stairs_open
@actor PORTER porter_spot walk
@focus none
PORTER [fr]: Bonne nuit, monsieur.
| 1: Good... evening? Monsieur.
| 2: Good night, monsieur.
| 3: Good night, monsieur.
-> FREE

== clerk_wait "The desk clerk"
@on talk PORTER if room_late and not met_contact
PORTER: Not yet, monsieur. She is still at it. I will have your key when it's ready.
-> clerk_ask

== clerk_idle "The desk clerk"
@on talk PORTER
if stairs_open
  PORTER: Second floor, monsieur, on the left. The stairs are fine; the lift is a lift in name only.
else
  PORTER: Monsieur.
end
-> clerk_ask

== clerk_ask "The desk clerk"
choose "The clerk waits, his hand on the book."
  // r26 (the owner, S103.6): the clerk never talks about another guest.
  // It's the house's policy, and no charm or money moves it.
  * if key_gone or knows_room or heard_41 [Ask about room forty-one] "Your gentleman in forty-one. What's he like?"
    PORTER: Our guests' habits are their own, monsieur.
  * once [Ask about the lift] "Is the lift out for long?"
    PORTER: Since Tuesday. We are supposed to have it fixed this Monday.
    set asked_lift
  * once if money >= 50 and (key_gone or knows_room or heard_41) [Slide a fifty across the desk] "For your trouble. Your gentleman in forty-one."
    The clerk looked at the note, and then at him, and slid it back across the desk with one finger.
    PORTER: Our guests' habits are their own, monsieur.
  * needs=delorme_card if took_card and not delorme_six [Show him Delorme's card] "Monsieur Delorme asked me to call on him. Early, he said."
    The clerk looked at the card, at the blue ink, and relaxed by a whole uniform.
    PORTER: Then you should know he leaves at six, monsieur. Come at a quarter to.
    set delorme_six
  * if money >= 10 and not has.umbrella [Buy one of the hotel's umbrellas] "Do you sell umbrellas?"
    PORTER: Ten euros, monsieur. They come back to us anyway, in the end. Everything does.
    pay 10
    give umbrella
  * silent [Nothing]
    The clerk nodded, and went back to his book and the rain.
end
-> FREE


// --- The regulars (r25) ---------------------------------------------------------
// A livelier bar: two at the bar, a couple at the window table, a man with a
// book. Nobody the story needs, and nobody who knows anything he shouldn't:
// a line or two each, and lives of their own while nothing asks anything of
// them (World.ts plays the idle= on their @actor lines).

== regular "The old man at the bar"
@on talk REGULAR
The old man at the bar had a Ricard going cloudy in front of him and the racing page folded under his elbow.
if tv_off
  REGULAR [fr]: Merci, pour la télé.
  | 1: Thank you. For the... telephone?
  | 2: Thanks for the TV.
  | 3: Thank you, for the television.
  He lifted his glass a centimetre, which at his age was a toast.
else
  REGULAR [fr]: Encore lui. Il parle, il parle.
  | 1: More of him. He speaks, he speaks.
  | 2: Him again. He talks and talks.
  | 3: Him again. He talks and he talks.
  He didn't look up at the screen. He'd seen enough of it.
end
REGULAR [fr]: Pas de politique au comptoir. C'est écrit dehors.
| 1: No politics at the account. It's written outdoors.
| 2: No politics at the bar. It says so outside.
| 3: No politics at the bar. It's written outside.
-> FREE

== worker "The man in the blue jersey"
@on talk WORKER
The big man in the blue jersey drank his beer as if it were part of the shift.
WORKER [fr]: Le dernier bus, c'est minuit dix. Après, à pied.
| 1: The last bus is at ten. After, by foot.
| 2: The last bus is at ten past twelve. After that it's on foot.
| 3: The last bus is ten past midnight. After that, you walk.
if speaks.fr
  ~ EMPATHY easy: He isn't telling him about the bus. He's telling himself he'll be on it.
else
  ~ EMPATHY easy: Whatever it was, he said it to his beer.
end
-> FREE

== couple_her "The couple at the window"
@on talk COUPLE_F
-> couple

== couple "The couple at the window"
@on talk COUPLE_M
The couple at the window table stopped talking as he came near, the way people did this month, and waited for him to be somebody else.
COUPLE_F [fr]: Bonsoir, monsieur.
| 1: Good night, monsieur.
| 2: Evening, monsieur.
| 3: Good evening, monsieur.
// r26: said low: at 2 points he loses a little of it.
COUPLE_M [fr]: Laisse. C'est un touriste.
| 1: Leave. It is a tourist.
| 2: Leave it. ... a tourist.
| 3: Leave it. He's a tourist.
They went back to each other, lower than before.
~ EMPATHY medium: Two people deciding something in a bar because it can't be decided at home.
-> FREE

== reader "The man with the book"
@on talk READER
The man in the armchair turned a page and then, since Based was still standing there, looked up over his glasses.
READER [fr]: Flaubert. Je le relis tous les dix ans. Ça finit toujours mal.
| 1: Flaubert. I've read it ten times. It always ends badly.
| 2: Flaubert. I reread him every ten years. It always ends badly.
| 3: Flaubert. I read him again every ten years. It always ends badly.
if speaks.fr
  ~ He means the book. Probably.
else
  ~ Flaubert, he caught. The rest was French.
end
-> FREE


// A save from before the regulars came (r25): they're in their places when
// he's next free.
// r25: a save from before the light was a flag, with one in his pocket.
== light_r25 "A light"
@on auto if not has_light and has.matchbook
set has_light
-> FREE

== crowd_r25 "Le Vauban"
@on auto if not crowd
@actor REGULAR stool_4 sit idle=drink in=vauban
@actor WORKER stool_2 sit idle=drink in=vauban
@actor COUPLE_M couple_m sit idle=talk:window in=vauban
@actor COUPLE_F couple_f sit idle=talk:window in=vauban
@actor READER reader_chair sit idle=read in=vauban
set crowd
-> FREE


// --- Using what he carries (r22 BPLAY) ------------------------------------------
// "@on use KEY": the inventory's Use, while he's free.

== use_phone_early "The phone"
@on use phone if not met_contact
One number in it, and a London code. He didn't call it.
~ Not yet. London said ten, and London's the kind of employer that counts.
-> FREE

== use_phone "The phone"
@on use phone if met_contact
He looked at the one number for a while, and put the phone away. Penhallow had said sparingly, and she'd meant it.
-> FREE

== use_cigarettes "A cigarette"
@on use cigarettes if has.matchbook
He shook one out of the blue packet and lit it, and the first drag tasted of a station café in Vienna in February.
~ ENDURANCE: Eleven months without. That's the trouble with quitting: you remember exactly where you left them.
He let it burn down, mostly unsmoked, and put it out.
-> FREE

== use_cigarettes_dry "A cigarette"
@on use cigarettes
if met_watcher or saw_watcher or room_mirror
  He had a cigarette and nothing to light it with, which made him, he realised, the man under the awning.
else
  He had a cigarette and nothing to light it with. He put it back.
end
-> FREE

== use_newspaper "Le Quotidien"
@on use newspaper
He folded the evening paper to the front page. RÉFÉRENDUM PAR DÉCRET, and under it the President at his lectern, looking reasonable.
[fr]: Le référendum dans quarante jours. L'Assemblée « consultée après que le peuple se sera prononcé ». Page trois : la marche « spontanée » des Volontaires, avec son parcours.
| 1: The referendum in forty days. The Assembly "consulted after the people will have pronounced themselves". Page three: the "spontaneous" walk of the Volunteers, with its golf course.
| 2: The referendum in forty days. The Assembly "consulted after the people have spoken". Page three: the Volunteers' "spontaneous" march, with its route.
| 3: The referendum in forty days. The Assembly "consulted once the people have spoken". Page three: the Volunteers' "spontaneous" march, route map included.
if speaks.fr >= 2
  ~ A spontaneous march with a route map. Somebody planned where.
end
set read_paper
-> FREE

== use_passport "The passport"
@on use passport
His own face, a little tired, in an American passport with John Locke's name in it. London's work, down to the worn corners.
~ MEMORY: The man in the room off Pall Mall who took the picture said "Don't smile", and he hadn't, and he hasn't much since.
-> FREE

== use_card "Delorme's card"
@on use delorme_card if took_card
He turned the card over under the light. Nothing written on the back; but the light lay across it, and the white was not quite flat.
choose "Something was pressed into it from the card written before it."
  * white FOCUS challenging [Read what's pressed into it]
    bonus +1 if has.matchbook "A match's soot, rubbed over the dents"
    Tilted to the lamp, the dents came up as numbers: a telephone number with a 01 39 at the front.
    if knows_satory
      ~ MEMORY: 01 39. Versailles, and the country west of it. Satory is a short drive from Versailles.
    else
      ~ MEMORY: 01 39. Versailles, and the country west of it.
    end
    set knows_versailles
  fail
    The dents might have been numbers. They might have been the grain of the card.
  * silent [Put it away]
end
-> FREE

== idea_vidal "The journalist"
@on think "Who is Claire Vidal watching?" if knows_vidal and met_contact
~ FOCUS: A journalist's car at the corner, a ticket on the screen, and nobody in it. She parked where she could see the hotel door, not the bar.
if knows_room or heard_41
  ~ The hotel, then. Room forty-one, or whoever comes down from it. She got here before London did.
else
  ~ The hotel, then, and whoever comes out of it. She's watching the same building I am, and she got here before London did.
end
set thought_vidal
-> FREE


== idea_coat "The camel coat"
@on think "Whose is the camel coat?" if coats and came_down
~ FOCUS: A dry camel coat on the stand. A man who came down from upstairs with a dry umbrella.
~ He doesn't keep it in his room because he wants it seen here. A coat on a stand says: I'm a guest, I come down for a drink, I'm nobody.
~ Men who need to be nobody hang their coats very carefully.
-> FREE


// --- The end of part one (r25) ------------------------------------------------
// After London's contact he's done with the street for tonight; he wants his
// bed. The clerk has his key and unhooks the rope (clerk_ready), he goes up
// the stairs to his room and sleeps, and it cuts to the palace window.

== street_door_shut "Rue de Grenelle"
@on look street_door if met_contact
-> door_thought

== hotel_door_shut "Rue de Grenelle"
@on look hotel_street_door if met_contact
-> door_thought

== door_thought "Rue de Grenelle"
if knew_seen
  ~ Not out there. The man under the awning saw him come in. Better he never sees him go out.
else
  ~ ENDURANCE: The rain, the street, a walk to nowhere at this hour. No. There's a bed upstairs with John Locke's name on it.
end
-> FREE


// A save from before the night was reshaped (r25: the walk to the river is
// gone and the night ends upstairs) takes up the new end: what they knew
// after London's contact, in the new words, and his journal's last task.
== upgrade_r25 "Le Vauban"
@on auto if met_contact and not knew_seen and not missed_watch
if she_is_blown
  set knew_seen
else
  set missed_watch
end
set old_night_task
task night "Get his key from the desk and go up to bed. The lift's out: the stairs, then."
-> FREE


== room "Room twenty-three"
@on enter room once if has_room and met_contact
@focus room
@news none
Twenty-three: a bed, a wardrobe, a radiator that knocked once and thought better of it, and a window full of rain with the roofs of the seventh arrondissement behind it.
He already had luggage on the floor at the foot of the bed, with his alias's wine-shipping label on it. London had sent it on ahead.
@actor BASED bed_side sit walk
He sat on the edge of the bed with his boots still on.
if knew_seen
  ~ Before breakfast, then. Out of the door before the man in grey has had his coffee, and after that nobody at all.
  if knows_satory and heard_41
    ~ Before six. Before forty-one's car to Satory.
  elif knows_car and heard_41
    ~ Before six. Before forty-one's car.
  elif delorme_six
    ~ Before six, when Delorme leaves.
  end
else
  ~ A first night, and nobody arrested. He'd take it.
end
if thought_rain
  ~ Outside, the gutters were running to the Seine, and the Seine was running west, the way it always had. Out to the sea, and England.
end
The rain went on doing what it had done every night since the results.
He was asleep before he'd decided to be.
task room done
task sleep done
if old_night_task
  task night done
end
-> epilogue


== epilogue "Élysée"
@place elysee
@ambient none
@actor PRESIDENT window_left fold wear=suit_dark_smoking
@actor COLONEL window_right wear=uniform_navy_smoking
@focus window
@card "PALAIS DE L'ÉLYSÉE" "The same night"
Two men at a tall window, smoking. Low cloud over the city, lit from underneath, and no light in the room but the ends of their cigarettes.
PRESIDENT: Brest?
COLONEL: Ready when you say.
PRESIDENT: Then I'll say it when the English are looking the other way.
COLONEL: They're looking now. Delorme says their woman at Le Vauban had company tonight.
PRESIDENT: Who?
COLONEL: An American. He came in out of the rain, ordered a drink, said very little to anybody, and then she sat down with him.
if gave_name
  COLONEL: He gave his name. Based.
  A silence, of the kind that is only possible in very large rooms.
  PRESIDENT: Find out who that is.
elif gave_alias
  COLONEL: He gave a name. John Locke. The hotel has him down for the wine trade.
  PRESIDENT: A philosopher who sells wine. Find out who he really is.
else
  COLONEL: He didn't give a name.
  PRESIDENT: Then he's somebody. Find out who.
end
if told_grey_wine
  COLONEL: He says he buys wine, for an importer in San Diego.
  PRESIDENT: Nobody comes to Le Vauban for the wine.
end
COLONEL: He has a room there. He went up to bed an hour ago.
PRESIDENT: Then he'll still be there in the morning.
COLONEL: And the English?
PRESIDENT: Let them look. It's good for them. It gives them something to do while we decide what they'll see.
@card "MR. BASED" "Eleven Days"
-> END
