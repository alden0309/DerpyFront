// MR. BASED, Chapter One: The First Glass
// The format is described in src/based/README.md. Every character, the
// party and the government are invented.
//
// r21: played like Disco Elysium. The story is the same; its form changed:
// the street and the bar are a place he walks about in (src/based/places/
// grenelle.json), what he reads in rooms and people he walks up to and looks
// at, what he works out is a skill check, and his skills speak up in his
// head. Lines marked "// r21: new" are new (a check's failure, a skill's
// voice); everything else is as it was written.

@chapter 1 "The First Glass"
@summary "Paris, a wet night, eleven days after the election. A wooden bar, a scotch nobody drinks, and a job for the British."
@start open

@cast BASED "Mr. Based" portrait=based_portrait look=suit_charcoal
@cast ANSELME "Anselme" portrait=anselme look=barman
@cast STRANGER "The man in grey" portrait=stranger look=suit_grey
@cast DELORME "Delorme" portrait=stranger body=STRANGER
@cast PENHALLOW "Penhallow" portrait=penhallow look=wool_woman
@cast WOMAN "The woman in the corner" portrait=penhallow body=PENHALLOW
@cast PRESIDENT "Montclar" look=suit_dark
@cast COLONEL "The Colonel" look=uniform_navy
@cast WATCHER "The man under the awning" look=coat_dark

// His skills: three attributes, three skills each. A check is two dice plus
// the skill against the difficulty; a passive one is the skill plus six.
@attribute WITS "Wits" "The trained mind: files, faces, languages, the craft."
@attribute NERVE "Nerve" "What holds when it counts: the face, the hands, the gut."
@attribute HEART "Heart" "Other people, and the one he carries with him."

@skill TRADECRAFT WITS "Tradecraft" "The job itself. Covers, tails, signals, drops; seeing the work in other people's work."
@skill MEMORY WITS "Memory" "Faces, files, names and dates. Seventeen years of them, and one name he won't say."
@skill LANGUAGES WITS "Languages" "French like a Parisian, English like an Englishman when it helps. Accents, and what they give away."
@skill COMPOSURE NERVE "Composure" "The face that gives nothing away. The hand that doesn't shake. The glass he doesn't drink."
@skill INSTINCT NERVE "Instinct" "The gut. Exits, watchers, the second before it goes wrong."
@skill MENACE NERVE "Menace" "Making a man wonder what you'd do. Leaning on him until he tells you."
@skill READ_PEOPLE HEART "Read People" "Tells and lies, grief and hope. What a face is doing while the mouth talks."
@skill CHARM HEART "Charm" "Being liked on purpose. The right joke, the right lie, kindly told."
@skill CONSCIENCE HEART "Conscience" "Her. Vienna. The first glass. The voice that keeps the account."

@points 9 min=1 max=5
@archetype ANALYST "The Analyst" WITS=4 NERVE=2 HEART=3 signature=MEMORY "Seventeen years of reading other people's mail. He remembers everything, which is the trouble."
@archetype HANDLER "The Handler" WITS=3 NERVE=2 HEART=4 signature=READ_PEOPLE "He ran agents in four capitals. People told him things they hadn't told their wives."
@archetype OPERATOR "The Operator" WITS=2 NERVE=4 HEART=3 signature=COMPOSURE "Cars, borders, bridges at night. The one they sent when it had to work."

@carry "You told Penhallow about the Colonel's offer. London is in it with you now." if told_penhallow
@carry "You lied to Penhallow about Delorme, and she saw you do it." if lied_to_penhallow
@carry "You let Penhallow draw her own conclusions." if quiet_with_penhallow
@carry "You kept Delorme's card." if took_card
@carry "You turned down Delorme's card. He left it under the first glass anyway." if refused_card
@carry "Delorme knows you saw through him." if called_out
@carry "You told Anselme the truth about the first glass." if told_anselme
@carry "Anselme has decided he likes you." if rel.anselme >= 2
@carry "You drank the first glass." if drank_first
@carry "You left the first glass where it was." if left_first


== open "Paris"
@checkpoint "Paris, a wet night"
@place grenelle
@ambient rain
@actor BASED street_start wear=overcoat_charcoal
@actor WATCHER watcher_spot fold
@actor ANSELME behind_bar lean
@actor PENHALLOW corner_chair sit
@focus street_open
@card "PARIS" "Eleven days after the election"
It had rained every day since the results, as if the city were trying to wash something off and hadn't found the right soap.
@focus none
@actor BASED street_mid walk
investigate "Rue de Grenelle" min=2 leave="Le Vauban" exit=vauban_door
  spot posters "The posters"
    On the boulevards the posters were coming away from the walls in long wet strips. The same face on all of them, most of it gone now; the same small bronze oak leaf in the corner; and under it the same two words: TENIR PAROLE.
    Keep your word.
    The party was called Le Serment, the Oath, and the slogan was the only promise it had ever made in plain words.
    ~ Everybody in this city keeps their word. It's just never the one you heard.
  spot van "The police van"
    At the corner of the rue de Grenelle a police van idled with its lights off and nobody in it. That was new, too.
end
-> vauban


== vauban "Le Vauban"
@actor BASED vauban_door_in walk
Le Vauban had been a hotel bar for a hundred and four years and a good one for about thirty of them.
@ambient rain_in
@actor BASED stool_end sit walk wear=suit_charcoal
Oak to the ceiling, brass to the knee, low lamps that made everyone look like a better version of a worse idea. Eleven stools. He had the one at the end, nearest the wall, with the room in the mirror.
@focus glasses
There were two glasses in front of him.
The second was in his hand. The first sat an inch to his left, two fingers of an Islay malt nobody had touched in forty minutes, going slowly warm in the lamplight.
@focus bar_end
He'd stopped counting the exits years ago. These days he counted the people who counted them.
~ INSTINCT medium: He'd stopped counting. Instinct hadn't. Three: the street, the hotel, and the door behind the bar for the staff.   // r21: new
Tonight there was nobody to count. That was usually when he started to drift.
-> reverie


== reverie "Lost in thought"
@focus glasses
@vignette none
@figure none
if thoughts >= 2
  -> interrupted
end
choose "Where does his mind go?"
  * once [The first glass] -> t_glass
  * once [The phone in his coat] -> t_phone
  * once [His left hand] -> t_scar
  * once [The rain] -> t_rain
  * [Back to the room] -> anselme
end


== t_glass "The first glass"
@vignette glass
The first glass was never for him.
He had ordered it the same way in eleven cities. Two fingers, no ice, no water, set down an inch to his left and left alone. In the good bars they learned not to clear it. In the bad ones they learned it once.
~ CONSCIENCE: Nine years. You'd think a man would run out of glasses.
There was a name that went with it. He didn't say it. He'd stopped saying it even in his own head, where it should have been safe, because his own head was the one place he'd learned it wasn't.
boost CONSCIENCE +1 "The first glass, and the name that goes with it"
set thought_glass
add thoughts 1
-> reverie


== t_phone "The British"
@vignette london
The phone in his coat had one number in it, and the number started with a London code.
Four days ago a man with a good tie and a bad cold had bought him lunch at a club off Pall Mall and spent an hour not asking him anything.
"We'd like to know what our neighbours are planning," he'd said at last, over the cheese. "And we would very much prefer it not to be us who asks."
~ Deniable. The most British word there is. If it goes wrong, you were never here. If it goes right, neither were you.
They hadn't asked why he'd left Langley. That was how he knew they'd read the file. People only stop asking when they think they already know.
boost TRADECRAFT +1 "What the British didn't ask"
set thought_phone
add thoughts 1
-> reverie


== t_scar "His left hand"
@vignette vienna_bridge
There was a white line across the knuckles of his left hand, thin as a hair. It went pink when he was cold.
A car window in Vienna, on a night in February. The engine running, the glass not breaking the way it does in films, and someone out on the bridge shouting his first name.
~ CONSCIENCE: Nobody has used it since. Nobody alive, anyway.
He had given the Agency seventeen years. They gave him a commendation, a pension and a polygraph, in that order, and only the polygraph ever asked the right question.
He left a month later. Langley let him go the way you let go of something hot: quickly, and without looking at it.
boost COMPOSURE +1 "Vienna, looked at"
set thought_scar
add thoughts 1
-> reverie


== t_rain "The rain"
@vignette rain_window
He'd been twenty-six the first time he saw Paris: a junior political officer at the embassy on the avenue Gabriel, with a cover so thin you could have read a newspaper through it.
He had loved the city the way you love things at twenty-six. Completely, and for the wrong reasons.
~ The city hasn't changed. That's the trouble with cities. They let you think it was you.
Outside the rain found the gutters, and the gutters found the Seine, and the Seine went where it had always gone: west, and out, and eventually to the sea, and England.
boost CHARM +1 "Paris at twenty-six"
set thought_rain
add thoughts 1
-> reverie


== interrupted "A glass on the oak"
@vignette none
@focus bar_end
@actor ANSELME behind_bar_based walk lean
@show water_glass
A glass of water touched the oak in front of him, not quite hard enough to be rude.
-> anselme


== anselme "Anselme"
@checkpoint "The bartender"
@vignette none
@actor ANSELME behind_bar_based walk lean
@focus anselme
@figure ANSELME
@news "Le président Montclar annonce une « révision constitutionnelle de salut public » · L'Assemblée suspendue « le temps que la nation reprenne son souffle »"
Anselme had been behind this bar since before the euro, and smiled at everyone. It was how he kept them from noticing that he listened.
ANSELME: Monsieur Based. You are looking at that glass as if it owes you money.
He said the name the French way, *Bah-ZAY*, which made it sound like a wine region instead of something a man had to write on forms.
choose "Anselme waits, cloth in hand." timer=10
  * [It might] "It might. I haven't decided."
    ANSELME: Then I will not ask for it back.
    rel ANSELME +1
  * [Ask about the television] "What's he saying?"
    set asked_politics
  * [Another, please] "Same again, Anselme."
    ANSELME: You have not finished this one. Either of them.
    BASED: I'm pacing myself.
  * silent [Say nothing]
    He let the silence answer. Anselme let it, too. Thirty years behind a bar teaches you which silences are for filling.
    rel ANSELME +1
end
Above the till, on mute, a man in a dark suit stood at a lectern with the tricolour behind him and said something that made the people around him applaud.
~ LANGUAGES easy: Salut public. Public safety. The last people to put that on a government were the Terror.   // r21: new
if asked_politics
  ANSELME: He is saying the Republic is tired. That it needs, how did he put it, a rest. Under supervision.
  ANSELME: *Révision constitutionnelle de salut public.* Public safety. The last time we had a Committee for that, they ran out of heads before they ran out of enemies.
  BASED: You don't sound like a man who voted for him.
  ANSELME (lightly): Nobody in Paris voted for him, monsieur. Ask anyone. And yet here he is.
  ANSELME: My grandson joined his Volunteers in the spring. They give them a little pin. An oak leaf, bronze. Like the generals have on their caps. He wears it on the inside of his lapel, so his grandmother won't see.
  ~ MEMORY: An oak leaf on the inside of the lapel. Worth remembering.
  set knows_oak
end
choose "The President goes on applauding himself." timer=8
  * [Turn it off] "Do me a favour and turn him off."
    Anselme found the remote in his apron and pointed it at the President with the expression of a man who had been waiting all evening for someone to ask.
    @news none
    set tv_off
    rel ANSELME +1
  * silent [Leave it on]
    He let the man on the screen keep talking to nobody. It seemed only fair. The whole country had been doing it for eleven days.
end
ANSELME: Ten years ago you sat on that stool with a lady who drank Kir Royale and laughed at my moustache.
ANSELME: Every time you come back, the same thing. Two glasses, and one of them for nobody. I never asked. Tonight I find I am old enough to ask.
choose "Anselme is looking at the first glass." timer=12
  * [She's late] "She's late. She was always late."
    ANSELME: Then I will not let anybody sit there.
    rel ANSELME +1
  * [Tell him the truth] "She isn't coming, Anselme. She hasn't been coming for nine years."
    Anselme put the cloth down, which in thirty years Based had never seen him do.
    ANSELME: Then I am sorry. She laughed at the moustache very well. Not everybody does.
    set told_anselme
    rel ANSELME +2
    remember ANSELME
  * [Don't] "Don't, Anselme."
    ANSELME: D'accord.
    He didn't. That was the thing about Anselme. When he said he wouldn't, he didn't.
  * silent [Say nothing]
    Anselme looked at the glass a moment longer, then at him, and then went to see about a bottle that didn't need seeing about.
    @actor ANSELME behind_bar_far walk lean
end
@figure none
-> room


== room "Read the room"
@focus none
When a room went quiet he read it. It was the oldest habit he had and the only one that had never let him down.
investigate "Read the room" min=3 leave="That'll do"
  spot room_mirror "The mirror behind the bottles"
    The mirror had the whole street in it, backwards and gold. Across the road, under the awning of a closed pharmacy, a man in a dark coat was smoking a cigarette he hadn't lit.
    ~ TRADECRAFT: Twenty minutes with an unlit cigarette. Either he's quitting, or he's waiting for a signal.
  spot corner "The woman in the corner"
    A woman in her fifties at the corner table, reading glasses, grey wool, a gin and tonic she hadn't touched. The Times folded open to the crossword, pen uncapped.
    In forty minutes she had not filled in a single square.
    ~ READ_PEOPLE: Either that's the hardest crossword in the world, or she isn't doing it.
  spot door "The door"
    Two sets of wet footprints on the tiles, both drying. His own, and a woman's, small and certain, that went straight to the corner table and never came back.
    No one else had come in from the street since. Whoever else was in the building had come down from inside it.
  spot coats "The coat stand"
    Three coats. His, wet. A woman's grey raincoat, wet. And a camel overcoat, good cloth, perfectly dry, belonging to nobody in the room.
    ~ TRADECRAFT: A dry coat on a wet night. Its owner has been in the hotel all evening, and he isn't in here. Yet.
  spot room_tv "The television"
    if tv_off
      Dark now. In the black glass he could see the room behind him, and himself in it, which was somehow worse than the President.
    else
      The new President of the Republic, on mute. He had a good face for television: handsome in a way that didn't frighten anyone, and serious in a way that did.
      The ticker crawled underneath him like a confession nobody was reading.
    end
  deduce expected "Someone was expecting him" needs=door,coats skill=TRADECRAFT diff=medium
    Nobody else had come in out of the rain, and somebody's dry coat was waiting on the stand.
    ~ Someone in this hotel knew I'd be here tonight. Someone other than the people who sent me.
  fail
    ~ TRADECRAFT: Prints and a dry coat. It adds up to something. Not yet.   // r21: new
  deduce english "The woman is English" needs=corner,door skill=READ_PEOPLE diff=challenging
    The Times, folded the English way, inside out. A gin she hadn't drunk, which was how you knew she was working.
    ~ London said there'd be a contact. London didn't say she'd already be here, watching me drink.
  fail
    ~ READ_PEOPLE: She could be from anywhere. Women who don't drink their gin usually are.   // r21: new
end
-> stranger


== stranger "The man in grey"
@checkpoint "The man in grey"
@actor BASED stool_end sit walk
@focus bar_end
Le Vauban had eleven stools and ten of them were empty.
@actor STRANGER lobby
The man in the grey suit came in from the hotel lobby, not the street, and took the one next to his.
@actor STRANGER stool_10 sit walk
@show umbrella
@figure STRANGER
STRANGER: The same as monsieur, please.
@show stranger_glass
He said it to Anselme without looking at the bottles, or at the glass, or at the man whose drink he was ordering. He sat close enough that their elbows almost touched on the oak. Close enough to be rude, or friendly, or neither.
choose "He's too close." timer=8
  * [Move a stool along] "Plenty of room tonight."
    @actor BASED stool_8 sit walk
    @hide glass_first
    @hide glass_second
    @hide water_glass
    @show glass_first_b
    @show glass_second_b
    He moved one stool along, taking both glasses with him.
    STRANGER (amused): Americans. You need so much space. It's the size of your country. It gets into you.
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
      ~ And that will be his camel coat on the stand. He's been upstairs all evening, waiting for me to settle.
    end
  spot shoes "His shoes"
    Black Derbys polished to a mirror, on thick rubber soles that didn't belong to the shoes. The kind of sole you buy when you spend your days standing, and some of your nights running.
  spot ring "His left hand"
    When he loosened his tie he showed a pale band on the fourth finger, where a ring usually lived.
    ~ READ_PEOPLE: He took it off to come to work. Men take their rings off for two reasons, and he doesn't smell of perfume.
  spot lapel "His lapel"
    When he leaned for a menu he didn't need, his lapel turned over. On its underside was a small bronze pin in the shape of an oak leaf.
    if knows_oak
      ~ MEMORY: Anselme's grandson wears one of those. Le Serment's Volunteers. On the inside, so nobody's grandmother sees.
    else
      ~ MEMORY: The oak leaf from the posters, worn where only somebody looking for it would find it. Which means it's meant for people who know to look.
    end
  spot order "His drink"
    He had ordered the same as monsieur without looking at monsieur's glass. Anselme had poured an Islay malt without being told which.
    ~ TRADECRAFT: He knew what I drink before he sat down. He's read a file. Mine.
  spot his_mirror "The mirror"
    if room_mirror
      In the mirror, across the street, the man under the pharmacy awning had finally lit his cigarette.
    else
      In the mirror, across the street, a man under a pharmacy awning lit a cigarette, as if he'd just been told he could.
    end
    ~ TRADECRAFT: So that's the signal. Contact made.
  deduce came_down "He was already in the building" needs=umbrella,shoes skill=TRADECRAFT diff=challenging
    bonus +2 if coats "The dry camel coat on the stand"
    Dry umbrella, dry shoulders, dry shoes. He hadn't come in out of the rain. He'd come down from a room upstairs, where he'd been waiting for the American to have a drink and settle.
  fail
    ~ TRADECRAFT: Dry shoes, a dry umbrella. A taxi to the door, perhaps. Perhaps.   // r21: new
  deduce party_man "Not police. Party." needs=shoes,lapel skill=MEMORY diff=challenging
    bonus +2 if knows_oak "Anselme's grandson's pin"
    bonus +1 if posters "The posters in the street"
    A policeman's soles and a bronze oak leaf. Not the Préfecture's man, then, and not the DGSI's.
    ~ The party has its own people now. Of course it does. They always do, just before they stop needing the police.
  fail
    ~ MEMORY: Rubber soles and a little bronze pin. Somebody's man. Whose, it won't say.   // r21: new
  deduce briefed "He knows exactly who I am" needs=order,ring skill=READ_PEOPLE diff=formidable
    He took his ring off to come to work, and his work tonight was knowing what I drink.
    ~ So much for the British being discreet. Somebody told Paris I was coming before I'd packed.
  fail
    ~ READ_PEOPLE: The ring, the drink. Two coincidences. Probably.   // r21: new
end
-> talk


== talk "Delorme"
if moved_away
  @focus two_at_bar_b
else
  @focus two_at_bar
end
@figure STRANGER
STRANGER: Terrible weather for tourists.
His English was very good. London good: a year or two at one of those schools that teach you to sound as if you'd never had to learn it.
~ LANGUAGES challenging: Westminster, then Sciences Po. The vowels of a man who learned his English from people who owned things.   // r21: new
choose "He smiles at the mirror, not at him." timer=12
  * [Play the tourist] "I came for the weather. The brochure was very honest."
    STRANGER (laughing): A man of culture. You must see the Louvre. Very big. Full of things other people took.
    set played_tourist
    rel DELORME +1
  * white MENACE challenging if came_down or briefed [Call him out] "You've been upstairs all evening, your ring's in your pocket and you ordered my drink before you'd seen it. Say what you came to say."
    bonus +2 if came_down "He came down from upstairs"
    bonus +2 if briefed "He knows what you drink"
    bonus +1 if party_man "His oak-leaf pin"
    For a moment the man in grey had nothing to say at all. Then he smiled, properly this time, as if he'd been handed a present he'd hoped for and not expected.
    STRANGER: They told me you were good. They didn't say you were rude with it. I like that. It saves time.
    set called_out
    rel DELORME -1
    remember DELORME
  fail
    The man in grey let it go past him like a waiter with someone else's order.   // r21: new
    STRANGER (mildly): You've been reading novels, monsieur. In novels the man at the bar is always a spy. In life he is usually a dentist.   // r21: new
  * if party_man [Name his employer] "Does Le Serment pay its people overtime, or is it all done for love?"
    The man in grey looked at him properly for the first time.
    STRANGER: For love, monsieur. But the love is very well paid.
    set named_party
  * silent [Say nothing]
    He drank, and said nothing, and let the man in grey fill the silence. People nearly always did. This one took nearly a minute, which was a kind of compliment.
    STRANGER: You're not a talker. Good. Neither is the man I work for.
end
if not called_out
  STRANGER: Tell me, monsieur. Do you like France?
  choose "He seems to want an answer." timer=10
    * [I like Paris] "I like Paris. I'm still making up my mind about France."
      STRANGER: So is France. That's what elections are for.
    * [The wine is good] "The wine's very good."
      STRANGER: The wine is the only thing in this country that has never needed reforming.
    * [Not tonight] "Not tonight."
      STRANGER: Nobody likes their country on a night like this. Give it a year. Countries are like marriages, monsieur. You learn to love what you're stuck with.
    * silent [Say nothing]
      STRANGER: Wise. It's a trick question this week.
  end
end
STRANGER: My President thinks France has spent fifty years apologising. To the Germans, to the English, to Brussels, to everyone. He thinks it's time we stopped.
STRANGER: I happen to agree with him. Most people do, though they would never say so in a bar like this one.
if tv_off
  He glanced at the dark television above the till, and smiled as if it had told a joke.
end
@figure DELORME
DELORME: My name is Delorme.
DELORME: It isn't, of course. But it's the one I brought with me, and it would be a shame to waste it.
DELORME: I'll be brief, because you are working and so am I. There is a man who would like to meet you. A colonel, once, until the army stopped being interesting to him. He has read about you. He says you are the best there is at a thing nobody admits needs doing.
DELORME: The English are paying you to find out what we intend. We would pay you more to tell them what we'd like them to hear. The same work. Twice the money.
DELORME: And for once in your life, monsieur, you'd be on the side that wins.
if moved_away
  @show card_b
else
  @show card
end
He took a card from his breast pocket and laid it on the oak between them. Plain white, a few words on it in blue ink.
-> card


== card "The card"
choose "The card lies on the oak between them." timer=15
  * once [Ask about the Colonel] "Which colonel? France has a great many."
    DELORME: This one says you met once, a long time ago. He says you won't remember him.
    DELORME: He remembers you.
    ~ MEMORY heroic: Colonels. Seventeen years of colonels, and he could put a name to every one. Not this one. That's what's wrong with it.   // r21: new
    -> card
  * [Take the card]
    @gesture BASED pick_up
    @hide card
    @hide card_b
    He picked it up, read it once and put it in his pocket. Delorme looked pleased, in the way a fisherman looks pleased: not yet, but soon.
    set took_card
    rel DELORME +1
  * [Leave it where it is] "I'm already employed."
    DELORME: Everyone is already employed, monsieur. That has never stopped anyone.
    @gesture STRANGER pick_up
    @hide card
    @hide card_b
    if moved_away
      @show card_under_b
    else
      @show card_under
    end
    He picked the card up himself and, with great care, slid it under the first glass.
    At the far end of the bar Anselme stopped polishing.
    set refused_card
    rel ANSELME +1
  * silent [Say nothing]
    He didn't touch it. Delorme didn't take it back.
    When Delorme had gone it was still there, and he put it in his pocket. There didn't seem much point in pretending.
    @hide card
    @hide card_b
    set took_card
end
-> goodbye


== goodbye "Bon courage"
Delorme finished his whisky, which was a waste of a good whisky, and left a note on the bar that would have paid for both of theirs twice.
@show delorme_note
if stayed_close
  DELORME: Bon courage, monsieur.
  He put a hand on Based's shoulder on his way past, briefly, the way Frenchmen do.
  The way Frenchmen do, he thought. Later he would remember thinking exactly that.
  set planted
else
  DELORME: Bon courage, monsieur. Anselme, a word.
  @actor ANSELME behind_bar_far walk lean
  He stopped at the far end of the bar and said something to Anselme too low to hear, and Anselme put something into the pocket of his apron.
end
@figure none
@actor STRANGER lobby_far walk
@hide umbrella
He went out the way he'd come, into the hotel and not the street, and the bar was quiet again.
-> penhallow


== penhallow "The woman in the corner"
@checkpoint "Penhallow"
@actor STRANGER none
@focus corner
Two minutes after Delorme had gone, the woman in the corner folded her newspaper, finished nothing, and came to the bar.
@actor PENHALLOW stool_10 sit walk
@hide gin_table
@show gin_bar
if moved_away
  @focus two_at_bar_b
else
  @focus two_at_bar
end
@figure WOMAN
She took Delorme's stool, as if it had been kept for her.
if corner
  choose "She orders nothing." timer=10
    * [Mention the crossword] "You can fill it in now. He's gone."
      WOMAN: I never fill them in. It gives the game away.
      ~ READ_PEOPLE: She almost smiles. Enough to tell me she expected me to notice.
      rel PENHALLOW +1
    * silent [Wait for her]
      He waited. She let him, and seemed to approve.
  end
else
  He hadn't noticed her. He noticed that he hadn't noticed her, which was worse.
  WOMAN: Forty minutes, Mr. Based. I'd begun to think London had overpaid.
  ~ READ_PEOPLE medium: She's been saving that line for forty minutes. She's pleased with it.   // r21: new
  rel PENHALLOW -1
end
@figure PENHALLOW
PENHALLOW: Penhallow. I'm the one who argued against hiring you. I lost, which is why I'm here and not somewhere warm.
PENHALLOW: I thought you should know that. I find it's healthier to start where we are.
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
  * [Tell her a little] "There was someone I was meant to keep safe. I didn't."
    For a moment she looked at him the way people look at a crossword they've decided, after all, to try.
    PENHALLOW: Thank you. That's more than Langley managed in nine years.
    rel PENHALLOW +1
    set told_vienna
  * [Mind your own business] "Then London should mind the hole. Holes are what it's hired me for."
    PENHALLOW (dryly): London minds everything, Mr. Based. It's our national sport. We're very bad at all the others.
    rel PENHALLOW -1
  * silent [Say nothing]
    He looked at the first glass, and said nothing, and she watched him do it.
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
PENHALLOW: Now. The man in the grey suit.
-> the_question


== the_question "The question"
@figure PENHALLOW
PENHALLOW: I couldn't hear him. I could see him. What did he want?
choose "Penhallow is watching his hands." timer=12
  * [Tell her everything] "He wants to buy me. A colonel wants a meeting. They'll pay double to feed you whatever they like."
    She was quiet for a while.
    PENHALLOW: Then you'll go. You'll let them buy you. And you'll tell us everything they say while they think they own you.
    PENHALLOW: That's a very dangerous thing to ask of anyone. I want you to notice that I'm asking it anyway.
    set told_penhallow
    rel PENHALLOW +2
    remember PENHALLOW
  * [Keep it to yourself] "He wanted to know if I liked Paris. I told him it rains too much."
    PENHALLOW: Funny. From where I was sitting it looked like he gave you his card.
    She let him hear how little she believed him, and then she let it go, which was worse.
    PENHALLOW: Have it your way, Mr. Based. I'm sure you know best.
    set lied_to_penhallow
    rel PENHALLOW -2
    remember PENHALLOW
  * silent [Say nothing]
    He said nothing. Penhallow looked at the card under the glass, or the pocket it had gone into, and drew her own conclusions. She looked like a woman who drew them for a living.
    PENHALLOW: Fine. Keep your secrets. Just make sure they're worth what we're paying for them.
    set quiet_with_penhallow
    rel PENHALLOW -1
end
She put a note under her untouched gin and stood.
PENHALLOW: You have a number. Use it sparingly. It's expensive, and so am I.
@figure none
@actor PENHALLOW street_cross walk
The door's bell rang once behind her. In the mirror he watched her cross the street without looking at the man under the awning, who didn't look at her, which told him everything about both of them.
-> photo


== photo "The photograph"
@checkpoint "The photograph"
@actor PENHALLOW none
if moved_away
  @focus bar_end_b
else
  @focus bar_end
end
if planted
  He reached into his coat for his wallet and found something that hadn't been in the pocket an hour ago.
  Stiff, glossy, the size of a playing card.
  ~ The hand on the shoulder. Of course. Seventeen years in the trade, and I let a man pat me on the back.
else
  if moved_away
    @actor ANSELME behind_bar_b walk lean
    @show photo_bar_b
  else
    @actor ANSELME behind_bar_based walk lean
    @show photo_bar
  end
  ANSELME: Monsieur. The gentleman in grey asked me to give you this. Later, he said. I think it is later.
  Anselme laid it face down on the oak and went to the far end of the bar, where he found a glass that needed polishing and polished it.
  @actor ANSELME behind_bar_far walk lean
end
@gesture BASED pick_up
He turned it over.
@backdrop photo_print
investigate "The photograph" min=3 leave="Turn it over"
  spot figure 40 40 "The man in the coat"
    A man walking away through deep snow, his back to the camera. Long dark coat, collar up, a fur hat he'd bought that afternoon because his ears were cold and he'd thought, God help him, that he had time.
    ~ It's me. Nine years younger, and leaving.
  spot snow 58 72 "The snow"
    Snow to the shins, untrodden except for his own tracks. No one else in the frame. Whoever took this had stood very still, for a long time, in very cold weather.
  spot branches 66 16 "The branches"
    The bare black fingers of a plane tree at the edge of the frame. The Stadtpark, by the river. He knew exactly which tree. He had walked past it twice a day for a month.
  spot paper 69 88 "The paper"
    Real paper, from a real negative, printed recently enough that it still smelled faintly of the chemicals.
    ~ TRADECRAFT: Someone kept the negative for nine years. And printed it tonight, for me.
  spot direction 44 76 "Where he's going"
    Away from the bridge. Away from the car, and the shouting, and her.
    ~ CONSCIENCE: I've never seen myself do it before. I've imagined it every night since.
  deduce watched "Someone was there" needs=figure,snow skill=INSTINCT diff=medium
    Someone stood in that park while it happened and photographed him leaving.
    ~ They knew then. They've known all along. And they've waited until now to tell me.
  fail
    ~ INSTINCT: Snow, and a man walking away. That's all a photograph ever is. Isn't it.   // r21: new
  deduce chosen "This is why they want me" needs=paper,direction skill=CONSCIENCE diff=challenging
    Not the best there is. Not the Englishman's man. The man in the snow, walking away from the bridge.
    ~ Whoever the Colonel is, he isn't buying a spy. He's buying the one thing I'd do anything to take back.
  fail
    ~ CONSCIENCE: Not now. Later, when there's less light.   // r21: new
end
@backdrop none
On the back, in neat blue ink, there was a name.
Her name. The one that went with the first glass.
He hadn't seen it written down in nine years. He didn't say it now.
Beneath it, in the same hand: *Invalides. Demain, midi.*
@vignette invalides
~ Noon tomorrow, at the Invalides. Under the gold dome, with the emperor in his box.
if refused_card
  The card was still under the first glass, where Delorme had put it. It said the same thing. It hadn't occurred to him, until now, that it was a reminder and not an invitation.
end
-> first_glass


== first_glass "The first glass"
@checkpoint "The first glass"
@vignette none
@ambient rain_in
if moved_away
  @focus glasses_b
else
  @focus glasses
end
Anselme had gone to the far end of the bar and was being very interested in a bottle, which was his way of leaving a man alone.
The first glass sat where it always sat. An inch to the left. Nine years of inches.
if refused_card
  @hide card_under
  @hide card_under_b
  Delorme's card was still under it. He slid it out and put it in his pocket, with the photograph.
end
if thought_glass
  ~ CONSCIENCE: Nine years of not saying her name. And tonight a stranger wrote it down for me.
end
choose "The first glass."
  * [Drink it]
    @gesture BASED drink
    He picked it up. It was warm from the lamp and from forty minutes of waiting.
    He drank it.
    It tasted like scotch, which was somehow the worst part.
    set drank_first
  * [Leave it]
    He left it where it was. He put two notes under the second glass and his coat over his arm.
    if moved_away
      @show coaster_b
    else
      @show coaster
    end
    At the far end of the bar Anselme reached for a coaster and laid it, gently, over the top of the first glass, the way he always did. As if someone might still come back for it.
    set left_first
    rel ANSELME +1
end
ANSELME: Bonne nuit, Monsieur Based.
if rel.anselme >= 2
  ANSELME: And monsieur. Whatever it is, be careful. My grandson says the Volunteers have been told to learn English.
end
-> street


== street "Rue de Grenelle"
@focus none
@figure none
@news none
@actor BASED vauban_door_out walk wear=overcoat_charcoal
@ambient rain
Outside the rain had thinned to the kind that doesn't fall so much as hang about.
if room_mirror
  @actor WATCHER none
  The man under the pharmacy awning was gone. There was a cigarette end on the pavement where he'd been, smoked down to the filter. He'd had a long wait.
else
  @actor WATCHER watcher_gone walk
  Across the road, under the awning of a closed pharmacy, a man in a dark coat dropped a cigarette and walked away without looking back.
end
@focus street_end
Somewhere above the rooftops a television was turned up too loud, and the President of the Republic was explaining to an empty kitchen why freedom needed a rest.
if tv_off
  Anselme's was off. Other people's weren't.
end
if thought_rain
  The gutters were still running to the Seine, and the Seine was still running west.
  ~ Out to the sea, and England. Everything in this city is heading for England tonight, one way or another.
end
~ Noon tomorrow. I have twelve hours to decide whose man I am.
~ It isn't long. It's longer than I usually get.
@actor BASED street_exit walk
He turned up his collar and walked towards the river.
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
COLONEL: They will be. They've hired someone to look for them.
PRESIDENT: The American.
COLONEL: He has the photograph by now.
PRESIDENT: And he'll come?
COLONEL: Men like him always go back for the ones they left.
A silence, of the kind that is only possible in very large rooms.
PRESIDENT: Does he know?
COLONEL: Not yet.
@card "MR. BASED" "Chapter One: The First Glass"
-> END
