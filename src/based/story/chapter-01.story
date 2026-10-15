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
@cast PORTER "The night porter" look=suit_dark
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
@skill LANGUAGES INTELLIGENCE "Languages" "How many tongues he has, and how well. Accents, and what they give away."
@skill FOCUS INTELLIGENCE "Focus" "Putting it together. The detail that doesn't fit, held still until it does."
@skill STRENGTH PHYSICAL "Strength" "Shoulders and grip. A door that won't give, a man who won't let go."
@skill ENDURANCE PHYSICAL "Endurance" "Cold, rain, long nights, the drink he didn't want. Holding on when it hurts."
@skill DEXTERITY PHYSICAL "Dexterity" "Quick hands. A card palmed, a page turned, a pocket that never felt a thing."
@skill PERCEPTION PHYSICAL "Perception" "Eyes and ears. What's in the room before anyone tells him."

@points 9 min=1 max=5
@archetype ANALYST "The Analyst" SOCIAL=2 INTELLIGENCE=4 PHYSICAL=3 signature=MEMORY "Seventeen years of reading other people's mail. He remembers everything, which is the trouble."
@archetype HANDLER "The Handler" SOCIAL=4 INTELLIGENCE=3 PHYSICAL=2 signature=EMPATHY "He ran agents in four capitals. People told him things they hadn't told their wives."
@archetype OPERATOR "The Operator" SOCIAL=3 INTELLIGENCE=2 PHYSICAL=4 signature=PERCEPTION "Cars, borders, bridges at night. The one they sent when it had to work."

// The languages he can be given. American English he has already.
@language fr "French"
@language en_gb "English (British)"
@language de "German"
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
@item passport "Passport" kind=document icon=passport start=1 "American, in his own name, which is either very brave or very lazy. London said a cover would only draw attention to him. London says a lot of things."

@item matchbook "Le Vauban matches" kind=small icon=matchbook "A book of matches from the bowl on the bar: LE VAUBAN in gold on oxblood, and the hotel's number. Twenty matches, which is nineteen more than a man needs to start a conversation."
@item cigarettes "Cigarettes" kind=small icon=cigarettes "A blue packet of Corsaires from the machine in the lobby. He quit in Vienna. He bought them anyway."
@item newspaper "Le Quotidien" kind=document icon=newspaper "Tonight's evening paper, left on the bar. REFERENDUM BY DECREE across the top, and a photograph of the President looking reasonable."
@item umbrella "Black umbrella" kind=tool slot=hand icon=umbrella "A big black umbrella from the stand by the bar's door, nobody's for a week, the barman says. In his hand it keeps the rain off him."
@item reading_glasses "Reading glasses" kind=clothes slot=glasses icon=glasses bonus=FOCUS+1,PERCEPTION-1 "Tortoiseshell, from the hotel's lost property. Small print comes up sharp; the far side of a room goes soft."
@item grey_scarf "Grey wool scarf" kind=clothes slot=neck icon=scarf bonus=ENDURANCE+1,INTIMIDATION-1 "Hand-knitted, a little long. Somebody's grandmother made it, and somebody left it in the lobby. Warm, and very hard to be frightening in."
@item flat_cap "Tweed flat cap" kind=clothes slot=hat icon=cap bonus=DECEPTION+1,CHARISMA-1 "A tweed cap from the lost property box. A cap changes a face more than a beard does, and nobody trusts it."
@item brass_lighter "Brass lighter" kind=small icon=lighter "A brass petrol lighter, heavy, engraved on the base: À Jean, pour ses vingt ans, 1968. Somebody lost more than a lighter."
@item baton "Telescopic baton" kind=weapon slot=hand icon=baton bonus=INTIMIDATION+2,EMPATHY-1 "Police issue, from the van with nobody in it. Folded, it's the length of a hand; flicked out, it's a reason. Held, it changes how people look at him."
@item delorme_card "Delorme's card" kind=document icon=card "Plain white, good stock. Delorme, in blue ink, and the hotel's number. Nothing on the back."

@carry "You met London's contact. She's called Penhallow, and she argued against hiring you." if met_contact
@carry "You told Penhallow what the man in grey wanted." if told_penhallow
@carry "You kept the man in grey to yourself." if kept_quiet
@carry "The man in grey thinks you sell wine." if wine_cover
@carry "The man in grey knows your name." if gave_name
@carry "Delorme has had room forty-one since the election." if knows_room
@carry "A car takes room forty-one to Satory at six." if knows_car
@carry "Anselme has decided he likes you." if rel.anselme >= 2
@carry "The man under the awning knows you saw him." if leaned_on_watcher
@carry "London knows about the car to Satory at six." if texted_london
@carry "Delorme's card has a Versailles number pressed into it." if knows_versailles
@carry "A police baton went missing from a van on the rue de Grenelle." if took_baton


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
@news "Le président Montclar annonce une « révision constitutionnelle de salut public » · L'Assemblée suspendue « le temps que la nation reprenne son souffle »"
@focus street_open
@card "PARIS" "Eleven days after the election"
It had rained every day since the results, as if the city were trying to wash something off and hadn't found the right soap.
@focus none
@actor BASED street_mid walk
London had given him a bar, a time and a newspaper. Le Vauban, on the rue de Grenelle, at ten. A woman with The Times, open at the crossword.
task contact "Meet London's contact at Le Vauban, on the rue de Grenelle, at ten. She'll have The Times, open at the crossword. Ask her about seven down."
~ Twenty minutes early. Time to look at the street the way the street was looking at him.
-> FREE


== posters "The posters"
@on look posters once
On the boulevards the posters were coming away from the walls in long wet strips. The same face on all of them, most of it gone now; the same small bronze oak leaf in the corner; and under it the same two words: TENIR PAROLE.
Keep your word.
The party was called Le Serment, the Oath, and the slogan was the only promise it had ever made in plain words.
~ Everybody in this city keeps their word. It's just never the one you heard.
set posters
-> FREE

== posters_again "The posters"
@on look posters
The face on the posters had lost another strip to the rain. The oak leaf hung on, small and bronze, in every corner.
~ PERCEPTION easy: Someone has been round with a brush and new paste. The rain takes them down by day and the Volunteers put them back by night.
-> FREE


== van "The police van"
@on look van once
At the corner of the rue de Grenelle a police van idled with its lights off and nobody in it. That was new, too.
~ INSTINCT medium: Engine running, nobody inside. Whoever left it means to come back to it quickly. They're on foot, close by, and not in uniform.
set van
-> van_door

== van_again "The police van"
@on look van
The van idled on. The rain ran off its roof in a thin sheet, and nobody came back for it.
if not took_baton
  -> van_door
end
-> FREE

// r22 BPLAY: something to take, if his hands are quick enough.
== van_door "The police van"
choose "The passenger window is down a finger's width. On the seat, under a yellow vest, something black and short."
  * white DEXTERITY medium [Reach in]
    bonus +1 if wears.gloves "Gloves: no prints on a police van"
    bonus +1 if weather.rain "The rain keeps every head down"
    Two fingers through the gap, the lock button, the door, the seat. A telescopic baton, police issue, folded to the length of his hand. It was up his sleeve before he'd decided to take it.
    ~ INSTINCT: Somebody will miss it at the end of the shift, and blame somebody else. That's the job.
    give baton
    set took_baton
  fail
    The lock button wouldn't come up for two fingers, and a man across the road looked up from his phone. He walked on as if he'd only been reading the plate.
  * silent [Leave it]
    He left the police their van.
end
-> FREE


== pharmacy "The pharmacy"
@on look pharmacy once
The pharmacy was shut, its green cross ticking on and off above the awning. In the window, beside an advertisement for cough syrup, someone had taped a notice from the Préfecture.
BY ORDER: gatherings of more than five persons on the public highway are suspended until further notice, for the duration of the constitutional revision.
~ The duration. Every government that suspends anything says it's for the duration. They never say of what.
set curfew
-> FREE

== pharmacy_again "The pharmacy"
@on look pharmacy
The cross went on ticking green over an empty pavement. Five persons, he thought. He made one.
-> FREE


== flyer "A leaflet in the gutter"
@on look flyer once
A leaflet had stuck itself to the kerb by the bench, the ink running. A bronze oak leaf at the top, and a young man in a good coat with his hand on his heart.
LES VOLONTAIRES DU SERMENT RECRUTENT. Ils ont tenu parole. Et vous ?
if speaks.fr
  ~ The Volunteers of the Oath are recruiting. They kept their word. Have you?
else
  ~ LANGUAGES easy: Volunteers, recruiting. Something about a word kept. The rest is the usual: a face, a heart, a promise.
end
~ MEMORY medium: The Volunteers. Le Serment's young men, eighteen months old as an organisation and already in leaflets this good. Somebody is paying for the paper.
set flyer
-> FREE

== flyer_again "The leaflet"
@on look flyer
The leaflet was turning to pulp. The young man's hand was still on his heart.
-> FREE


== watcher "The man under the awning"
@on talk WATCHER once if not met_contact
Under the awning of the closed pharmacy, out of the rain, a man in a dark coat was holding a cigarette he hadn't lit.
WATCHER [fr]: Vous avez du feu ? | Got a light?
choose "He's holding out the cigarette."
  * needs=matchbook|brass_lighter [Give him a light] "Here."
    if has.matchbook
      He struck one of Le Vauban's matches and cupped it. The man leaned in, looked at the flame and not at the face behind it, and didn't light the cigarette.
    else
      He thumbed the brass lighter and held it out. The man leaned in, looked at the flame, then at the engraving on the base, and didn't light the cigarette.
    end
    WATCHER [fr]: Merci. Finalement, non. | Thanks. On second thoughts, no.
    ~ INSTINCT medium: He doesn't want it lit. Not yet. An unlit cigarette is a man waiting for a signal; a lit one means he's had it.
    set watcher_light
  * needs=cigarettes [Offer him one of yours] "Have one of mine. Yours looks tired."
    The man looked at the blue packet, and at him, and took one, and put it behind his ear with the other.
    WATCHER: Corsaires. Nobody smokes Corsaires, monsieur. Only the machines sell them.
    ~ EMPATHY medium: He's been told not to take anything from anyone. He took it anyway. He's cold, and bored, and twenty-three.
    set watcher_light
    set watcher_warmed
  * white INTIMIDATION medium if armed [Let him see the baton] "Who sent you to stand under that awning?"
    The man looked at the baton, and then very carefully at nothing.
    WATCHER: Nobody sent me. I watch a door for a man who pays. The man in grey. Now go and have your drink, monsieur, and I'll forget your face.
    ~ INSTINCT: The man in grey pays him. So the man in grey isn't police: police don't pay, they send.
    set leaned_on_watcher
    set watcher_told
  fail
    WATCHER: Put that away, monsieur. There's a van at the corner, and it isn't mine.
  * white INTIMIDATION challenging [Ask who he's waiting for] "You've been under that awning since I turned the corner. Who are you waiting for?"
    bonus +1 if van "The van with nobody in it"
    The man looked at him properly for the first time, and then at the bar's warm windows across the road, and then at nothing.
    WATCHER: Nobody you know, monsieur. Go and have your drink.
    ~ He said it in English. He'd heard my accent and he's been told to watch for an American. No: told to watch the bar. I'm just the American who walked up to him.
    set leaned_on_watcher
  fail
    WATCHER [fr]: Je ne comprends pas, monsieur. | I don't understand, sir.
    He understood perfectly. He turned his shoulder to the rain and to the question.
  * silent [Leave him be]
    He left the man to his awning and his cigarette.
end
set met_watcher
-> FREE

== watcher_after "The man under the awning"
@on talk WATCHER if met_contact and not watcher_gone
The man under the awning had lit his cigarette at last. He smoked it the way men smoke when they've finished work and haven't been told they can go home.
choose "He doesn't look at you."
  * white INTIMIDATION medium [Tell him to go home] "Whoever you were waiting for came and went. Go home."
    bonus +2 if leaned_on_watcher "He's met you before"
    He dropped the cigarette, ground it out with care, and walked off towards the boulevard without hurrying. Twice he looked back.
    @actor WATCHER watcher_gone walk
    set watcher_gone
  fail
    WATCHER: I'm going home when I'm told, monsieur. Same as you.
  * if armed [Let him see the baton] "Your shift's over."
    The man looked at the baton for a long second, then dropped his cigarette and walked off towards the boulevard. He didn't look back once, which was its own kind of looking.
    @actor WATCHER watcher_gone walk
    set watcher_gone
  * silent [Leave him be]
    He left the man to his awning.
end
-> FREE

== watcher_idle "The man under the awning"
@on talk WATCHER
WATCHER [fr]: Bonne soirée, monsieur. | Good evening, sir.
He said it to the rain.
-> FREE


== too_early "Towards the river"
@on look street_west if not met_contact
The rue de Grenelle ran on west, wet and empty, towards the boulevards and the river.
~ Not yet. London's paying for tonight, and tonight is at Le Vauban.
-> FREE


// --- Le Vauban -----------------------------------------------------------------

== vauban "Le Vauban"
@on enter vauban once
@ambient rain_in
@focus entrance
Le Vauban had been a hotel bar for a hundred and four years and a good one for about thirty of them.
Oak to the ceiling, brass to the knee, low lamps that made everyone look like a better version of a worse idea. Eleven stools, all of them empty.
@focus bar_end
He'd stopped counting the exits years ago. These days he counted the people who counted them.
~ PERCEPTION medium: He'd stopped counting. His eyes hadn't. Three: the street, the hotel, and the door behind the bar for the staff.
A barman with a cloth. A woman in the corner with a newspaper. A television above the till, talking to nobody.
@focus none
-> FREE


== mirror "The mirror"
@on look room_mirror once
The mirror behind the bottles had the whole street in it, backwards and gold. Across the road, under the awning of the closed pharmacy, a man in a dark coat was holding a cigarette he hadn't lit.
if met_watcher
  ~ INSTINCT: My friend with the matches. From in here he has the door, the windows and the woman in the corner, and nobody inside has him.
else
  ~ INSTINCT: Twenty minutes with an unlit cigarette. Either he's quitting, or he's waiting for a signal.
end
set room_mirror
-> FREE

== mirror_again "The mirror"
@on look room_mirror
if watcher_gone
  In the mirror the awning across the road was empty. A cigarette end lay on the pavement where the man had stood.
else
  In the mirror, across the road, the man under the awning was still there, and still not smoking.
end
-> FREE


== corner "The woman in the corner"
@on look corner once
A woman in her fifties at the corner table: reading glasses, grey wool, a gin and tonic she hadn't touched. The Times, folded open at the crossword, pen uncapped.
In forty minutes she had not filled in a single square.
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
Two sets of wet footprints on the tiles, drying. His own, fresh; and a woman's, small and certain, that went straight to the corner table and never came back.
No one else had come in from the street in forty minutes. Whoever else was in the building had come down from inside it.
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
if delorme_gone
  The camel coat had gone from the stand. Its owner hadn't needed it to go upstairs.
else
  The camel coat hung on the stand, dry as a bone.
end
-> FREE


== tv "The television"
@on look room_tv
if tv_off
  Dark now. In the black glass he could see the room behind him, and himself in it, which was somehow worse than the President.
else
  The new President of the Republic, on mute. He had a good face for television: handsome in a way that didn't frighten anyone, and serious in a way that did.
  The ticker crawled underneath him like a confession nobody was reading.
  ~ LANGUAGES easy: Salut public. Public safety. The last people to put that on a government were the Terror.
end
set room_tv
-> FREE


== register "The register"
@on look register once
The hotel register lay open on the porter's desk: a heavy book, a ribbon, a fountain pen on a chain like a dog.
~ DEXTERITY medium: A page turned with one finger while the porter looks at the rain. Forty-one: M. Delorme, Paris. Since the twentieth. Paid a month ahead, in cash.
if skill.dexterity >= 3
  set knows_room
end
set register
-> FREE

== register_again "The register"
@on look register
The register lay where it was, closed now, the pen hanging off the desk on its chain.
-> FREE


// --- The barman ----------------------------------------------------------------

// r22 BPLAY: a weapon in his hand changes how people read him.
== barman_armed "The barman"
@on talk BARMAN if armed
@figure BARMAN
The barman looked at the baton in his hand and went on polishing the same glass.
BARMAN: Not in my bar, monsieur. Put that away and I will pour you anything you like.
@figure none
-> FREE

== order "The barman"
@on talk BARMAN once
@actor BASED stool_end sit walk
@focus anselme
@figure BARMAN
The barman had been behind this bar a long time, and smiled at everyone. It was how he kept them from noticing that he listened.
BARMAN [fr]: Bonsoir, monsieur. Qu'est-ce que je vous sers ? | Good evening, sir. What can I get you?
choose "He waits, cloth in hand."
  * [A scotch] "A scotch. Islay, if you have one. No ice."
    BARMAN: Of course, monsieur.
    @show glass_second
    set drink_scotch
  * [A beer] "Whatever you have on tap."
    BARMAN: Of course.
    @show his_beer
    set drink_beer
  * [Just water] "Water. It's been a long day and it isn't over."
    BARMAN: A wise man. We do not get many.
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
  * white DECEPTION easy [A cover] "I'm in wine. Buying, not drinking. Mostly."
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
    BARMAN [fr]: Révision constitutionnelle de salut public. | A constitutional revision of public safety.
    BARMAN: The last time we had a Committee for public safety, they ran out of heads before they ran out of enemies.
    BASED: You don't sound like a man who voted for him.
    BARMAN (lightly): Nobody in Paris voted for him, monsieur. Ask anyone. And yet here he is.
    BARMAN: My grandson joined his Volunteers in the spring. They give them a little pin. An oak leaf, bronze. Like the generals have on their caps. He wears it on the inside of his lapel, so his grandmother won't see.
    ~ MEMORY: An oak leaf on the inside of the lapel. Worth remembering.
    set knows_oak
    rel ANSELME +1
  * silent [Let him watch]
    They watched the President applaud himself together, the way strangers watch a fire.
end
choose "The President goes on applauding himself."
  * [Turn it off] "Do me a favour and turn him off."
    The barman found the remote in his apron and pointed it at the President with the expression of a man who had been waiting all evening for someone to ask.
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
The phone in his jacket had one number in it, and the number started with a London code.
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
Le Vauban had eleven stools and ten of them were empty.
@actor STRANGER lobby
The man in the grey suit came in from the hotel lobby, not the street, and took the one next to his.
@actor STRANGER stool_10 sit walk
@show umbrella
@figure STRANGER
STRANGER [fr]: Un Ricard, Anselme. | A Ricard, Anselme.
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
    ~ PERCEPTION: He heard the accent in three words. He'll have heard plenty of Americans this week; the embassy's been busy.
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
    if knows_oak
      ~ MEMORY: The barman's grandson wears one of those. Le Serment's Volunteers. On the inside, so nobody's grandmother sees.
    else
      ~ MEMORY: The oak leaf from the posters, worn where only somebody looking for it would find it. Which means it's meant for people who know to look.
    end
  spot order "His drink"
    He'd ordered without looking at the bottles, and the barman had poured without being told which. A regular, then, of a bar he doesn't like: he hasn't touched it.
    ~ FOCUS: He's here every night, at a table he doesn't sit at, with a drink he doesn't drink. That's not a habit. That's a post.
  spot his_mirror "The mirror"
    if room_mirror
      In the mirror, across the street, the man under the pharmacy awning had finally lit his cigarette.
    else
      In the mirror, across the street, a man under a pharmacy awning lit a cigarette, as if he'd just been told he could.
    end
    ~ INSTINCT: So that's the signal. The man in grey is in place, and the street knows it.
  deduce came_down "He was already in the building" needs=umbrella,shoes skill=FOCUS diff=challenging
    bonus +2 if coats "The dry camel coat on the stand"
    bonus +1 if door "Nobody came in from the street"
    Dry umbrella, dry shoulders, dry shoes. He hadn't come in out of the rain. He'd come down from a room upstairs, where he lives, by the look of the coat.
  fail
    ~ FOCUS: Dry shoes, a dry umbrella. A taxi to the door, perhaps. Perhaps.
  deduce party_man "Not police. Party." needs=shoes,lapel skill=MEMORY diff=challenging
    bonus +2 if knows_oak "The barman's grandson's pin"
    bonus +1 if posters "The posters in the street"
    bonus +1 if flyer "The Volunteers' leaflet"
    A policeman's soles and a bronze oak leaf. Not the Préfecture's man, then, and not the DGSI's.
    ~ The party has its own people now. Of course it does. They always do, just before they stop needing the police.
  fail
    ~ MEMORY: Rubber soles and a little bronze pin. Somebody's man. Whose, it won't say.
  deduce on_duty "He's on duty, and not for me" needs=order,ring skill=EMPATHY diff=challenging
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
His English was very good. London good: a year or two at one of those schools that teach you to sound as if you'd never had to learn it.
~ LANGUAGES challenging: Westminster, then Sciences Po. The vowels of a man who learned his English from people who owned things.
choose "He smiles at the mirror, not at him."
  * [Play the tourist] "I came for the weather. The brochure was very honest."
    STRANGER (laughing): A man of culture. You must see the Louvre. Very big. Full of things other people took.
    rel DELORME +1
  * if wine_cover [Keep to the wine] "I'm here for the wine. Buying."
    STRANGER: In this bar? Then you are either a very bad buyer or a very good one. I will decide later.
    set wine_cover
  * white INTIMIDATION challenging if came_down or party_man [Call him out] "You came down from upstairs, you've a party pin under your lapel and you've been sitting at this bar every night since the election. Who are you watching?"
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
    STRANGER: You're not a talker. Good. Neither is the man I work for.
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
STRANGER: My President thinks France has spent fifty years apologising. To the Germans, to the English, to Brussels, to everyone. He thinks it's time we stopped.
STRANGER: I happen to agree with him. Most people do, though they would never say so in a bar like this one.
if tv_off
  He glanced at the dark television above the till, and smiled as if it had told a joke.
end
-> name


== name "A name"
@figure STRANGER
STRANGER: We haven't been introduced. I like to know who I'm drinking next to.
choose "He waits for a name."
  * [Give him yours] "Based."
    STRANGER: Based. Like the wine region. Bah-zay.
    He said it the French way, which made it sound like somewhere you'd go for the weekend instead of something a man had to write on forms.
    ~ INSTINCT: Now he has it. Men like him don't ask for things they don't mean to keep.
    set gave_name
  * white DECEPTION medium [Give him another] "Walker. Tom Walker."
    bonus +2 if wine_cover "A wine buyer already"
    bonus +1 if speaks.en_gb "He can sound like anyone"
    STRANGER: Walker. A good name for a tourist.
    He believed it, or he believed it enough to stop asking, which in Paris this month came to the same thing.
    set cover_name
  fail
    STRANGER (smiling): Of course it is.
    ~ DECEPTION: Too quick. Nobody says their own name that fast.
    set gave_name
  * silent [Say nothing]
    STRANGER: A man with no name in a bar with no customers. How very romantic.
end
@figure DELORME
DELORME: Delorme. It isn't, of course. But it's the one I brought with me, and it would be a shame to waste it.
DELORME: If you need anything in Paris, monsieur, the hotel knows where to find me. Paris is a little complicated just now, for visitors.
if moved_away
  @show card_b
else
  @show card
end
He laid a card on the oak between them, plain white, a few words on it in blue ink, and stood.
-> goodbye


== goodbye "Bon courage"
DELORME: Bon courage, monsieur.
if stayed_close
  He put a hand on Based's shoulder on his way past, briefly, the way Frenchmen do.
  ~ PERCEPTION medium: And on the way past, a look at the corner table. Half a second. It was the only thing he'd looked at all night that he hadn't pretended not to.
  set saw_the_look
else
  @actor BARMAN behind_bar_far walk lean
  DELORME: Anselme, un mot. | Anselme, a word.
  He stopped at the far end of the bar and said something to the barman too low to hear.
  DELORME [fr medium]: L'Américain. Tu ne le connais pas ? Préviens-moi s'il revient. | The American. You don't know him? Let me know if he comes back.
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
  * [Tell her a little] "An exchange on a bridge. A man of ours was meant to walk across. He didn't."
    For a moment she looked at him the way people look at a crossword they've decided, after all, to try.
    PENHALLOW: Thank you. That's more than Langley managed in nine years.
    rel PENHALLOW +1
    set told_vienna
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


== the_question "The question"
@figure PENHALLOW
PENHALLOW: I couldn't hear him. I could see him. What did he want?
choose "Penhallow is watching his hands." timer=12
  * [Tell her everything] "He wanted to know who I was. He's party, not police; he lives upstairs, and he sits at this bar every night."
    PENHALLOW: Delorme. He's had a room here since the election. We assumed he was watching the hotel.
    if saw_the_look or on_duty
      BASED: He's watching you.
      She was quiet for a while.
      PENHALLOW: Then I'm blown, and you've been seen with me. That's a very bad start, Mr. Based. I want you to notice I'm not blaming you for it.
      set she_is_blown
    else
      PENHALLOW: Whatever he's watching, he's seen you now. Be a tourist for a few days. Be boring. You'd be amazed how well it works.
    end
    set told_penhallow
    rel PENHALLOW +2
    remember PENHALLOW
  * [Keep it to yourself] "He wanted to know if I liked Paris. I told him it rains too much."
    PENHALLOW: Funny. From where I was sitting it looked like he gave you his card.
    She let him hear how little she believed him, and then she let it go, which was worse.
    PENHALLOW: Have it your way, Mr. Based. I'm sure you know best.
    set kept_quiet
    rel PENHALLOW -2
    remember PENHALLOW
  * silent [Say nothing]
    He said nothing. Penhallow looked at the card on the oak and drew her own conclusions. She looked like a woman who drew them for a living.
    PENHALLOW: Fine. Keep your secrets. Just make sure they're worth what we're paying for them.
    set kept_quiet
    rel PENHALLOW -1
end
She put a note under the gin she hadn't drunk and stood.
PENHALLOW: You have a number. Use it sparingly. It's expensive, and so am I.
@figure none
@actor WOMAN street_cross walk in=street
The door's bell rang once behind her. In the mirror he watched her cross the street without looking at the man under the awning, who didn't look at her, which told him everything about both of them.
task clovis "Find out what CLOVIS is. A word in a cable from the Élysée to the Ministry of the Armed Forces, and then nowhere."
task delorme "Find out what the man in grey is watching, and for whom. The hotel knows where to find him."
task night "When he's seen enough, call it a night. The river is west, at the end of the rue de Grenelle."
@weather changing
@focus none
~ Le Vauban, the hotel, the street. The night isn't over just because London has gone home.
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


== anselme_after "Anselme"
@on talk BARMAN once if met_contact
@figure BARMAN
The barman came down the bar with his cloth, which was how he said he was listening.
BARMAN: Another, monsieur? Or the bill? At this hour they are the same thing.
BASED: What's your name?
ANSELME: Anselme. For thirty-one years. Before that I was Anselme's son.
@figure ANSELME
choose "Anselme waits, polishing."
  * white CHARISMA medium [Ask what the man in grey wanted] "The gentleman in grey had a word with you. Anything I should know?"
    bonus +1 if rel.anselme >= 1 "He likes you"
    bonus +2 if rel.anselme >= 2 "He's decided he likes you"
    Anselme looked at the far end of the bar, where there was nobody, and lowered his voice anyway.
    ANSELME: He asked if I knew you. I said no, which was true. He asked me to telephone him if you came back. Room forty-one.
    ANSELME: I will not, of course. But you should know I was asked.
    set knows_room
    set anselme_told
    rel ANSELME +1
  fail
    ANSELME (lightly): He wanted a Ricard, monsieur. He always wants a Ricard.
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

== anselme_idle "Anselme"
@on talk BARMAN
@figure ANSELME
if anselme_told
  ANSELME: Room forty-one, monsieur. I said nothing. You heard nothing. We are both very discreet.
elif tv_off
  ANSELME: You see? Without the President it is almost a nice evening.
else
  ANSELME: He is still talking. They will have to switch off the whole country to stop him.
end
choose "Anselme polishes a glass that was clean already."
  * if not has.matchbook and not has.brass_lighter [Ask for a light]
    ANSELME: A light? Take a box, monsieur. Take two. They are the only thing in Paris that is still free.
    give matchbook
  * if not paid and (drink_scotch or drink_beer) [Pay what you owe]
    Anselme wrote the bill on a scrap of paper and laid it face down.
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
== woman_armed "The woman in the corner"
@on talk WOMAN if armed
She looked at the baton over the top of her reading glasses, and went back to the crossword.
WOMAN (quietly): Put that away, Mr. Based. This is a bar, not a briefing, and I'm not paid enough to watch you be arrested.
-> FREE

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

== porter_armed "The night porter"
@on talk PORTER if armed
The porter's eyes went to the baton and stayed there.
PORTER: Monsieur, I have a telephone, and the Préfecture has a number. I would rather not introduce them.
He turned his back, which in a night porter is as good as a locked door.
-> FREE

== porter "The night porter"
@on talk PORTER once
@actor BASED see_desk walk
The night porter was on the telephone, in a German that came from somewhere east of Leipzig and had been sanded down by twenty years in Paris.
PORTER [de]: Zimmer einundvierzig will um sechs einen Wagen. Ja. Nach Satory. | Forty-one wants a car at six. Yes. To Satory.
if speaks.de
  ~ MEMORY medium: Satory. The army's ground south of Versailles: the tanks, the testing range, the generals' lunches. A strange place to take a man at six in the morning.
  set knows_car
end
He put the phone down and turned the smile on.
PORTER: Monsieur? A room?
choose "The porter waits."
  * white CHARISMA medium [Ask about room forty-one] "Your gentleman in forty-one. Is he always up this early?"
    bonus +2 if knows_room "You know the room"
    PORTER: Monsieur Delorme? He is up before the birds, monsieur. Since the election, every morning a car. He tips like an Englishman, so: badly.
    set knows_room
    set knows_car
  fail
    PORTER: Our guests' habits are their own, monsieur.
  * white DECEPTION challenging [Say you're from the Préfecture] "Préfecture. We're checking registers along the street."
    bonus +2 if speaks.fr "Your French is good enough"
    bonus +1 if wears.reading_glasses "Reading glasses: a clerk's face"
    The porter turned the register round for him without a word, the way people do this month when somebody says Préfecture.
    set knows_room
  fail
    PORTER: Then the Préfecture will have a card, monsieur. They always have a card.
    ~ He knows the Préfecture better than I do. Everyone in Paris does, this month.
  * [Just looking] "Just looking. It's a nice old lobby."
    PORTER: It was nicer when people looked at it, monsieur.
end
-> FREE

== porter_idle "The night porter"
@on talk PORTER
if took_lost
  PORTER: The lost property, monsieur, is for the people who lost it. I mention it only.
else
  PORTER: Monsieur.
end
choose "The porter waits, with the patience of a man paid by the night."
  * if not knows_car and money >= 50 [Fold a fifty into the register] "For your trouble. Your gentleman in forty-one."
    pay 50
    The note went into the register and the register went into a drawer.
    PORTER: Forty-one has a car at six every morning, monsieur. To Satory. I never told you, and you never paid me.
    set knows_room
    set knows_car
  * needs=delorme_card if not knows_car [Show him Delorme's card] "Monsieur Delorme asked me to call on him. Early, he said."
    The porter looked at the card, at the blue ink, and relaxed by a whole uniform.
    PORTER: Then you should know he leaves at six, monsieur. The car takes him to Satory. Come at a quarter to.
    set knows_room
    set knows_car
  * silent [Nothing]
    The porter nodded, and went back to the register and the rain.
end
-> FREE


// --- Using what he carries (r22 BPLAY) ------------------------------------------
// "@on use KEY": the inventory's Use, while he's free.

== use_phone_early "The phone"
@on use phone if not met_contact
One number in it, and a London code. He didn't call it.
~ Not yet. London said ten, and London's the kind of employer that counts.
-> FREE

== use_phone_car "The phone"
@on use phone if knows_car and not texted_london
The phone, the one number, and a car at six to Satory.
choose "London said to use it sparingly."
  * [Send London two lines] "Room forty-one. A car to Satory, six o'clock."
    He typed it with his thumb and sent it before he could make it better. A minute later the screen lit: a single full stop.
    ~ That's London for "received". They'd use a semicolon for "well done", if anyone ever did anything well enough.
    set texted_london
  * silent [Not yet]
    He put it back in the jacket. Sparingly, she'd said.
end
-> FREE

== use_phone "The phone"
@on use phone
He looked at the one number for a while, and put the phone away. Penhallow had said sparingly, and she'd meant it.
-> FREE

== use_cigarettes "A cigarette"
@on use cigarettes if has.matchbook or has.brass_lighter
He shook one out of the blue packet and lit it, and the first drag tasted of a station café in Vienna in February.
~ ENDURANCE: Eleven months without. That's the trouble with quitting: you remember exactly where you left them.
He let it burn down, mostly unsmoked, and put it out.
-> FREE

== use_cigarettes_dry "A cigarette"
@on use cigarettes
He had a cigarette and nothing to light it with, which made him, he realised, the man under the awning.
-> FREE

== use_newspaper "Le Quotidien"
@on use newspaper
He folded the evening paper to the front page. REFERENDUM BY DECREE, and under it the President at his lectern, looking reasonable.
if speaks.fr
  ~ The referendum in forty days. The Assembly "consulted after the people have spoken". Page three: a Volunteers' march, "spontaneous", with a route map.
else
  ~ LANGUAGES easy: Référendum, décret, quarante jours. Forty days. Page three has a map with a route marked on it: the Volunteers are marching, and somebody planned where.
end
set read_paper
-> FREE

== use_passport "The passport"
@on use passport
His own face, five years younger, in an American passport with his own name in it.
~ MEMORY: The photographer at the post office in Arlington said "Don't smile", and he hadn't, and he hasn't much since.
-> FREE

== use_card "Delorme's card"
@on use delorme_card
He turned the card over under the light. Nothing written on the back; but the light lay across it, and the white was not quite flat.
choose "Something was pressed into it from the card written before it."
  * white FOCUS challenging [Read what's pressed into it]
    bonus +2 if wears.reading_glasses "Reading glasses"
    bonus +1 if has.matchbook "A match's soot, rubbed over the dents"
    Tilted to the lamp, the dents came up as numbers: a telephone number with a 01 39 at the front.
    ~ MEMORY: 01 39. Versailles, and the country west of it. Satory is a short drive from Versailles.
    set knows_versailles
  fail
    The dents might have been numbers. They might have been the grain of the card.
  * silent [Put it away]
end
-> FREE

== use_lighter "The brass lighter"
@on use brass_lighter
He thumbed it open and shut. À Jean, pour ses vingt ans, 1968. Somebody gave a boy of twenty a lighter in the year Paris last went out into the streets.
~ EMPATHY: And somebody lost it in a hotel lobby, fifty-odd years later, and never came back for it.
-> FREE

== use_baton "The baton"
@on use baton
He let it out to its full length with a flick of the wrist, and closed it again against his thigh. It made exactly the sound it was made to make.
~ INTIMIDATION: People hear that sound once and remember it. That's all it's for, most nights.
-> FREE


// --- What he works out ---------------------------------------------------------

== idea_watching "Who was he watching?"
@on think "Who was the man in grey watching?" if delorme_gone and corner and not she_is_blown and (saw_the_look or on_duty or tried_parole)
~ FOCUS: Every night at this bar, a drink he doesn't drink, a ring in his pocket. The woman in the corner has been coming here for weeks, if the barman's nod meant anything.
~ FOCUS: She looked at the lobby door before she answered me. She knew he'd come down.
~ He wasn't watching the bar. He was watching her. And tonight, for the first time, she had someone to meet.
set worked_out_watch
-> FREE


== idea_coat "The camel coat"
@on think "Whose is the camel coat?" if coats and came_down
~ FOCUS: A dry camel coat on the stand. A man who came down from upstairs with a dry umbrella.
~ He doesn't keep it in his room because he wants it seen here. A coat on a stand says: I'm a guest, I come down for a drink, I'm nobody.
~ Men who need to be nobody hang their coats very carefully.
-> FREE


// She left by the street door; out there she's already gone.
== street_after "Rue de Grenelle"
@on enter street once if met_contact
@actor WOMAN none
The rue de Grenelle again, and the rain still at it. No sign of the woman with The Times. The pavement had kept nothing of her, which was how she would have wanted it.
-> FREE


// --- Calling it a night ----------------------------------------------------------

== street_end "Rue de Grenelle"
@on look street_west if met_contact
choose "The rue de Grenelle runs on west, towards the river."
  * [Call it a night]
    -> street
  * silent [Not yet]
    ~ Not yet. There's still the hotel, and the street, and whatever's left in the bottom of the glass.
    -> FREE
end


== street "Rue de Grenelle"
@focus street_end
@figure none
@news none
@weather drizzle
@ambient rain
Outside the rain had thinned to the kind that doesn't fall so much as hang about.
if watcher_gone
  The pharmacy awning was empty. There was a cigarette end on the pavement where the man had been, smoked down to the filter. He'd had a long wait.
else
  Across the road, under the awning of the closed pharmacy, a man in a dark coat dropped a cigarette and walked away without looking back.
  @actor WATCHER watcher_gone walk
end
Somewhere above the rooftops a television was turned up too loud, and the President of the Republic was explaining to an empty kitchen why freedom needed a rest.
if tv_off
  The barman's was off. Other people's weren't.
end
if thought_rain
  The gutters were still running to the Seine, and the Seine was still running west.
  ~ Out to the sea, and England. Everything in this city is heading for England tonight, one way or another.
end
if knows_car
  ~ Six o'clock, a car to Satory. I could be standing somewhere I can see it go.
end
if knows_versailles
  ~ And a Versailles number pressed into the back of a card. Satory's in the Versailles exchange. Everything tonight points west.
end
~ Eleven days. A new government, an old bar, and a man in grey who knows my face now, if not my name.
@actor BASED street_exit walk
He zipped the jacket up to its collar and walked towards the river.
task night done
-> epilogue


== epilogue "Élysée"
@place elysee
@ambient none
@actor PRESIDENT window_left fold
@actor COLONEL window_right
@focus window
@card "PALAIS DE L'ÉLYSÉE" "The same night"
Two men at a tall window. Low cloud over the city, lit from underneath, and no lights on in the room.
PRESIDENT: Brest?
COLONEL: Ready when you say.
PRESIDENT: Then I'll say it when the English are looking the other way.
COLONEL: They're looking now. Delorme says their woman at Le Vauban had company tonight.
PRESIDENT: Who?
COLONEL: An American. He came in out of the rain, ordered a drink and talked to nobody until she sat down.
if gave_name
  COLONEL: He gave his name. Based.
  A silence, of the kind that is only possible in very large rooms.
  PRESIDENT: Find out who that is.
elif cover_name
  COLONEL: He says his name is Walker.
  PRESIDENT: Nobody's name is Walker.
else
  COLONEL: He didn't give a name.
  PRESIDENT: Then he's somebody. Find out who.
end
COLONEL: And the English?
PRESIDENT: Let them look. It's good for them. It gives them something to do while we decide what they'll see.
@card "MR. BASED" "Chapter One: Eleven Days"
-> END
