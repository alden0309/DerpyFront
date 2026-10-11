// LIFE (r11): matters at work. Your days at your post are worked for you;
// every few weeks something comes up that wants a decision: a task worth
// taking on (a rush order, a difficult patient, the governor's horse), or a
// trouble to deal with (a cracked millstone, a drunk journeyman, a leaking
// hold). Each trade has its own. Crooked livings and the law have matters
// of their own (Crime.ts).

import type { ConquestGame } from "./Game";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  hurt,
  journal,
  remembers,
  spend,
} from "./LifeCore";
import type { LCtx, LifeEventDef } from "./LifeEvents";
import { rankOf } from "./LifeQueries";
import { JOBS } from "./LifeRules";
import { charName } from "./Queries";
import { matterDue, noteMatter } from "./Trades";
import type { JobKind, Life, Skill } from "./Types";

interface Matter {
  title: string;
  /** "{boss}" is your master's name, "{here}" the town. */
  body: string;
  /** Take it on yourself (tests the trade's main skill, or `skill`). */
  go: string;
  /** The careful way: it costs a little (time, coins, a word with your master). */
  safe: string;
  /** Leave it be. */
  skip: string;
  skill?: Skill;
}

interface MatterSet {
  task: Matter;
  trouble: Matter;
}

const m = (
  title: string,
  body: string,
  go: string,
  safe: string,
  skip: string,
  skill?: Skill,
): Matter => ({ title, body, go, safe, skip, skill });

/** Every honest trade's own matters. */
export const MATTERS: Partial<Record<JobKind, MatterSet>> = {
  farmer: {
    task: m(
      "Rain before the harvest",
      "Black clouds over {here} and the wheat still standing. Bring it in tonight by lantern, or trust the weather.",
      "Work through the night",
      "Get in what you safely can",
      "Trust the weather",
    ),
    trouble: m(
      "A neighbour's hogs",
      "Your neighbour's hogs are through the fence again and halfway through your corn.",
      "Mend the fence yourself, properly",
      "Ask {boss} to have words",
      "Let it go",
      "craft",
    ),
  },
  millhand: {
    task: m(
      "A rush of timber",
      "A shipbuilder wants planking by the week's end and will pay over the odds.",
      "Run the saw day and night",
      "Do what can be done well",
      "Let the others have it",
    ),
    trouble: m(
      "The race is choked",
      "Ice and branches have choked the mill race and the wheel has stopped.",
      "Wade in and clear it",
      "Wait for the thaw",
      "Leave it to the others",
      "fighting",
    ),
  },
  newsman: {
    task: m(
      "A scoop",
      "A sailor off the packet has news from London nobody else has yet. If it's set tonight, the paper beats the others by a week.",
      "Set it tonight",
      "Check it first, print it Thursday",
      "Leave it for the others",
    ),
    trouble: m(
      "A libel",
      "A gentleman says the last number libelled him, and his friends are waiting outside with sticks.",
      "Talk him round",
      "Print an apology",
      "Bar the door",
      "persuasion",
    ),
  },
  soldier: {
    task: m(
      "A picket in the woods",
      "The sergeant wants volunteers for a forward picket: cold, dangerous, and noticed.",
      "Volunteer",
      "Do your turn and no more",
      "Keep your head down",
    ),
    trouble: m(
      "A quarrel in the barracks",
      "Two men of your mess are at each other with bayonets over a debt.",
      "Step between them",
      "Fetch the sergeant",
      "Look away",
      "leadership",
    ),
  },
  sailor: {
    task: m(
      "Aloft in a blow",
      "The fore-topsail has split in a squall and someone has to go up and cut it free.",
      "Go aloft",
      "Haul from the deck",
      "Leave it to the topmen",
    ),
    trouble: m(
      "Short rations",
      "The purser has been selling the ship's beef ashore, and the crew is muttering.",
      "Speak up for the crew",
      "Tell the mate quietly",
      "Say nothing",
      "persuasion",
    ),
  },
  clerk: {
    task: m(
      "A cargo to place",
      "A ship is in with a mixed cargo and nobody to sell it. {boss} says it's yours if you want it.",
      "Take the cargo in hand",
      "Sell it safely, at cost",
      "Pass",
    ),
    trouble: m(
      "The books won't balance",
      "Forty coins are missing from the ledger, and the auditor comes Monday.",
      "Find the error",
      "Confess it to {boss}",
      "Fudge it",
      "letters",
    ),
  },
  official: {
    task: m(
      "The governor's letter",
      "The governor wants a letter to London that says no without saying no.",
      "Draft it yourself",
      "Copy the usual form",
      "Leave it to the secretary",
    ),
    trouble: m(
      "A petitioner at the door",
      "A widow has walked twenty miles about her husband's land patent, and the office has lost the papers.",
      "Find them, somehow",
      "Send her to the assembly",
      "Turn her away",
      "persuasion",
    ),
  },
  law: {
    task: m(
      "A case nobody wants",
      "A poor man accused of theft needs counsel, and the court has nobody willing.",
      "Take the case",
      "Plead it briefly",
      "Decline",
    ),
    trouble: m(
      "A threatening client",
      "A client who lost his suit says you sold him out, and says it with a horsewhip.",
      "Talk him down",
      "Return the fee",
      "Hide in chambers",
      "persuasion",
    ),
  },
  craftsman: {
    task: m(
      "A fine commission",
      "A planter wants a fine piece for his new house and will pay well if it's right.",
      "Make it your masterpiece",
      "Make a good plain piece",
      "Turn it down",
    ),
    trouble: m(
      "A bad batch",
      "The iron (or the timber) {boss} bought is rotten through, and the orders are due.",
      "Make do with skill",
      "Buy better at your cost",
      "Use it anyway",
    ),
  },
  trapper: {
    task: m(
      "Beaver on the far creek",
      "Fresh sign of beaver two days up a creek nobody has trapped.",
      "Go up the creek",
      "Work your usual lines",
      "Stay put",
      "woodcraft",
    ),
    trouble: m(
      "Robbed lines",
      "Someone has been robbing your traps and leaving them sprung.",
      "Track the thief",
      "Move your lines",
      "Shrug it off",
      "woodcraft",
    ),
  },
  servant: {
    task: m(
      "Extra work for a coin",
      "A neighbour will pay you a coin a day to help with his harvest on your Sundays.",
      "Take the work",
      "Ask your master first",
      "Rest on the Sabbath",
    ),
    trouble: m(
      "The overseer's temper",
      "The overseer has it in for you, and the lash is never far from his hand.",
      "Stand up to him",
      "Keep your head down",
      "Take it",
      "fighting",
    ),
  },
  preacher: {
    task: m(
      "A dying man's confession",
      "A man of the parish is dying and wants to unburden himself, and he's no friend of the church.",
      "Go to him",
      "Send a curate",
      "Let another go",
      "faith",
    ),
    trouble: m(
      "Dissenters in the parish",
      "A field preacher is drawing your flock away to meetings in a barn.",
      "Preach against him",
      "Visit and talk",
      "Ignore it",
      "persuasion",
    ),
  },
  physician: {
    task: m(
      "A fever in a great house",
      "A planter's son is burning with fever and the family will pay anything.",
      "Treat him yourself",
      "Bleed and purge, the usual",
      "Send for another",
    ),
    trouble: m(
      "Bodysnatchers",
      "Your anatomy lessons need bodies, and the churchyard has a watchman now.",
      "Make your own arrangements",
      "Make do with books",
      "Give up anatomy",
      "stealth",
    ),
  },
  innkeeper: {
    task: m(
      "The assembly comes to dinner",
      "A dozen assemblymen want the long room, a dinner and no questions asked.",
      "Lay on a feast",
      "A decent dinner",
      "Turn them away",
      "trade",
    ),
    trouble: m(
      "A brawl in the taproom",
      "Sailors and soldiers are at it in the taproom and the furniture is going.",
      "Wade in and stop it",
      "Send for the watch",
      "Let them finish",
      "fighting",
    ),
  },
  hunter: {
    task: m(
      "A herd in the valley",
      "Elk in the lower valley, more than anyone has seen in years.",
      "Lead the hunt",
      "Take what you need",
      "Leave them be",
    ),
    trouble: m(
      "A wounded bear",
      "A bear hit badly by someone else's arrow is somewhere near the village, and angry.",
      "Track it down",
      "Warn everyone, wait",
      "Keep away",
      "fighting",
    ),
  },
  warrior: {
    task: m(
      "A scout to the frontier",
      "The war leader wants someone to watch the enemy's trails for a moon.",
      "Go yourself",
      "Go with others",
      "Stay at the fire",
    ),
    trouble: m(
      "A young man's boast",
      "A young warrior boasts he will raid the colonists alone, and others are listening.",
      "Talk him down",
      "Tell the elders",
      "Let him go",
      "persuasion",
    ),
  },
  grower: {
    task: m(
      "The seed exchange",
      "A neighbouring village offers seed of a corn that grows in half the time.",
      "Trade for it and plant it",
      "Plant a little of it",
      "Keep the old seed",
      "trade",
    ),
    trouble: m(
      "Crows in the corn",
      "Crows are taking the young corn faster than the children can scare them.",
      "Build scaffolds and watch",
      "Replant later",
      "Let them be",
      "craft",
    ),
  },
  healer: {
    task: m(
      "A sickness from the coast",
      "A sickness the old songs don't know has come with traders from the coast.",
      "Tend the sick yourself",
      "Keep the sick apart",
      "Leave it to older healers",
      "medicine",
    ),
    trouble: m(
      "A rival's medicine",
      "A healer from another clan says your cures are weak, and people listen.",
      "Show your skill",
      "Visit and share",
      "Ignore it",
      "persuasion",
    ),
  },
  trader: {
    task: m(
      "A big trade",
      "A colonial factor wants a winter's furs, and will pay in guns and cloth.",
      "Strike the bargain",
      "A fair small trade",
      "Turn him away",
    ),
    trouble: m(
      "Watered rum",
      "A trader's rum is mostly river water, and he's paid in your people's furs.",
      "Expose him",
      "Warn the others quietly",
      "Say nothing",
      "persuasion",
    ),
  },
  speaker: {
    task: m(
      "A message to carry",
      "The sachem needs words carried to a council far off, and spoken exactly.",
      "Carry it yourself",
      "Carry it with an elder",
      "Let another go",
    ),
    trouble: m(
      "Words twisted",
      "The colonists' interpreter has twisted what the council said, and they're angry.",
      "Set it straight at their house",
      "Send a wampum belt",
      "Let it lie",
      "persuasion",
    ),
  },
  maker: {
    task: m(
      "A great canoe",
      "The council wants a great canoe for the treaty journey.",
      "Make it yourself",
      "Make it with the others",
      "Leave it to others",
    ),
    trouble: m(
      "Bad bark",
      "The elm bark is split and the birch is too thin this year.",
      "Go far for better",
      "Patch and make do",
      "Wait a year",
      "woodcraft",
    ),
  },
  // ------------------------------------------------ the new trades
  blacksmith: {
    task: m(
      "The governor's horse",
      "The governor's grey has thrown a shoe on the way through {here}, and his groom is in a hurry.",
      "Shoe it yourself, finely",
      "Do a plain job",
      "Let the master do it",
    ),
    trouble: m(
      "A burst bellows",
      "The bellows have split and the fire is dying with three orders on the anvil.",
      "Patch them and work on",
      "Buy new leather",
      "Down tools for the day",
      "craft",
    ),
  },
  cooper: {
    task: m(
      "Barrels for the fleet",
      "The fishing fleet sails Friday and wants a hundred casks for salt cod.",
      "Work till they're done",
      "Make what you can, well",
      "Leave it to the others",
    ),
    trouble: m(
      "Leaking hogsheads",
      "A planter's tobacco hogsheads leaked on the voyage and he wants his money back.",
      "Prove it was the ship",
      "Pay something back",
      "Tell him to go hang",
      "persuasion",
    ),
  },
  tanner: {
    task: m(
      "Leather for the army",
      "The garrison wants boot leather and belts, in a hurry and in quantity.",
      "Take the whole order",
      "Take what you can cure",
      "Pass",
    ),
    trouble: m(
      "The neighbours complain",
      "The neighbours have petitioned the court about the stink from the pits.",
      "Plead your case at court",
      "Pay them off",
      "Ignore them",
      "persuasion",
    ),
  },
  ropewalker: {
    task: m(
      "A cable for a man-of-war",
      "A navy ship needs a new anchor cable, and the captain pays in silver.",
      "Lay the cable yourself",
      "Lay it the usual way",
      "Let the foreman",
    ),
    trouble: m(
      "Rotten hemp",
      "The last bales of hemp are rotten at the heart.",
      "Pick through it by hand",
      "Send back for more",
      "Spin it anyway",
      "craft",
    ),
  },
  shipwright: {
    task: m(
      "A sloop on the slip",
      "A merchant wants a fast sloop by spring and will pay a bonus for speed.",
      "Drive the work on",
      "Build her right, not fast",
      "Leave it to the master",
    ),
    trouble: m(
      "Shipworm",
      "A hull in for repair is riddled with shipworm below the waterline.",
      "Replace the planks properly",
      "Patch it and tar it",
      "Pass it as sound",
      "craft",
    ),
  },
  carpenter: {
    task: m(
      "A new meeting house",
      "The town wants a meeting house raised before winter, and timber is cut.",
      "Lead the raising",
      "Work under another",
      "Turn it down",
    ),
    trouble: m(
      "A beam gives way",
      "A beam you set has cracked and the barn is sagging.",
      "Shore it up yourself",
      "Pay for a new beam",
      "Blame the timber",
      "craft",
    ),
  },
  miller: {
    task: m(
      "The harvest rush",
      "Every farmer for miles has brought grain at once, and they're queued down the lane.",
      "Grind day and night",
      "First come, first served",
      "Take the easy ones",
    ),
    trouble: m(
      "Accused of a heavy hand",
      "A farmer swears you took a double toll from his sacks, loudly, at church.",
      "Weigh his next sack before him",
      "Give him a sack back",
      "Call him a liar",
      "persuasion",
    ),
  },
  brewer: {
    task: m(
      "Ale for the muster",
      "The militia musters Saturday and the colonel wants a barrel for every company.",
      "Brew it all",
      "Brew what you can",
      "Leave it to another house",
    ),
    trouble: m(
      "A sour brew",
      "A whole brewing has gone sour in the vat.",
      "Save it with skill",
      "Pour it away",
      "Sell it anyway",
      "craft",
    ),
  },
  distiller: {
    task: m(
      "Rum for the coast trade",
      "A captain bound for Africa wants a hundred hogsheads of rum.",
      "Run the stills hot",
      "Make what you can",
      "Turn him down",
    ),
    trouble: m(
      "A fire at the still",
      "Spilt spirits have caught and the still-house is burning.",
      "Fight the fire",
      "Get everyone out",
      "Run",
      "fighting",
    ),
  },
  fisherman: {
    task: m(
      "Cod on the banks",
      "Word is the cod are thick on the far banks, two days out.",
      "Go out to the banks",
      "Fish the bay",
      "Stay ashore",
    ),
    trouble: m(
      "Nets fouled",
      "Your nets are fouled on a wreck in the bay.",
      "Dive for them",
      "Cut your losses",
      "Leave them",
      "seamanship",
    ),
  },
  whaler: {
    task: m(
      "A right whale off the point",
      '"There she blows!" from the lookout on the dunes. A right whale, close in.',
      "Take the harpoon",
      "Pull an oar",
      "Stay ashore",
    ),
    trouble: m(
      "A stove boat",
      "A whale has stove in a boat and men are in the water.",
      "Go in after them",
      "Throw lines",
      "Pull for shore",
      "seamanship",
    ),
  },
  surveyor: {
    task: m(
      "A great patent to run",
      "A speculator wants ten thousand acres run out on the frontier, and pays by the mile.",
      "Go yourself",
      "Send the chain-bearers",
      "Decline",
    ),
    trouble: m(
      "A disputed line",
      "Two planters both claim the same creek bottom, and you drew one of the lines.",
      "Run the line again, honestly",
      "Split the difference",
      "Side with the richer",
      "woodcraft",
    ),
  },
  schoolmaster: {
    task: m(
      "A bright pupil",
      "A poor boy in your school has a head for Latin, and no money for the college.",
      "Tutor him for nothing",
      "Write to a patron",
      "Let him go to the plough",
    ),
    trouble: m(
      "A riot in the schoolroom",
      "The big boys have locked you out of your own schoolhouse. It is, they say, a tradition.",
      "Break the door down",
      "Bargain with them",
      "Wait it out",
      "persuasion",
    ),
  },
  midwife: {
    task: m(
      "A hard birth",
      "A woman across the river has been in labour two days, and the child lies wrong.",
      "Go to her now",
      "Send for the physician too",
      "Let another go",
    ),
    trouble: m(
      "Whispers of witchcraft",
      "A child you delivered died, and a neighbour is whispering about witchcraft.",
      "Face her down",
      "Ask the minister to speak",
      "Keep away",
      "persuasion",
    ),
  },
  apothecary: {
    task: m(
      "Bark for the fever season",
      "Fever season is coming, and Jesuit's bark is short. A ship is in with some.",
      "Buy it all",
      "Buy what you need",
      "Wait",
    ),
    trouble: m(
      "A wrong prescription",
      "A patient took too much laudanum from your shop and nearly died.",
      "Nurse him yourself",
      "Pay the family",
      "Deny it",
      "medicine",
    ),
  },
  shopkeeper: {
    task: m(
      "A cargo of tea",
      "A captain has a chest of good tea going cheap for cash.",
      "Buy and sell it on",
      "Buy a little",
      "Pass",
    ),
    trouble: m(
      "Bad debts",
      "Half the county owes you on the books, and the harvest has failed.",
      "Go and collect",
      "Carry them another year",
      "Write it off",
      "persuasion",
    ),
  },
  interpreter: {
    task: m(
      "A treaty council",
      "A treaty council meets at {here}, and both sides want you to speak for them.",
      "Speak true for both",
      "Speak only what's said",
      "Stay away",
      "persuasion",
    ),
    trouble: m(
      "Bribes for the words",
      "A land company offers coins if you soften what the council says.",
      "Refuse, and tell them both",
      "Refuse quietly",
      "Take it",
      "persuasion",
    ),
  },
  guide: {
    task: m(
      "Surveyors to guide",
      "A party of surveyors wants guiding to the western waters.",
      "Lead them",
      "Take them part of the way",
      "Decline",
      "woodcraft",
    ),
    trouble: m(
      "Lost travellers",
      "A party you took on has strayed in the night and is lost.",
      "Track them down",
      "Fire a gun and wait",
      "Go on without them",
      "woodcraft",
    ),
  },
  counsellor: {
    task: m(
      "The sachem's question",
      "The sachem asks your counsel: peace with the colonists, or war while there is time.",
      "Speak your mind",
      "Say what others say",
      "Keep silent",
      "persuasion",
    ),
    trouble: m(
      "A rival's whispers",
      "Another counsellor is whispering against you in the sachem's lodge.",
      "Answer him at the fire",
      "Bring gifts",
      "Ignore it",
      "persuasion",
    ),
  },
  militia: {
    task: m(
      "A frontier patrol",
      "Raiders have been seen beyond the settlements, and the captain wants a patrol.",
      "Go out with it",
      "Stand guard at home",
      "Find an excuse",
    ),
    trouble: m(
      "Muster-day drunkards",
      "Half the company is drunk at muster and the colonel is watching.",
      "Sober them up and drill them",
      "Report them",
      "Join them",
      "leadership",
    ),
  },
};

/** The odds on a matter's bold choice: harder for higher rungs. */
function dcOf(life: Life, trouble: boolean): number {
  return 5 + (life.job?.rank ?? 0) * 2 + (trouble ? 1 : 0);
}

function matterOf(life: Life, ctx: LCtx): Matter | undefined {
  const set = life.job ? MATTERS[life.job.kind] : undefined;
  if (!set) return undefined;
  return ctx.t ? set.trouble : set.task;
}

function fill(g: ConquestGame, life: Life, text: string): string {
  const boss =
    life.job && !life.job.own ? g.s.chars[life.job.employer] : undefined;
  return text
    .replace(/\{boss\}/g, boss?.alive ? charName(boss) : "your master")
    .replace(/\{here\}/g, g.map.provinces[life.prov]?.name ?? "town");
}

const wageOfRung = (life: Life) => rankOf(life)?.wage ?? 2;

function bossNotes(g: ConquestGame, life: Life, why: string, v: number): void {
  const job = life.job;
  if (!job || job.own) return;
  const boss = g.s.chars[job.employer];
  if (boss?.alive) remembers(g, life, boss, why, v, 0.5);
}

function skillFor(life: Life, mt: Matter | undefined, trouble: boolean): Skill {
  if (mt?.skill) return mt.skill;
  const def = life.job ? JOBS[life.job.kind] : undefined;
  return (trouble ? def?.second : def?.main) ?? "craft";
}

export const WORK_EVENTS: LifeEventDef[] = [
  {
    key: "work-task",
    pool: "raised",
    cooldown: 0,
    title: (g, life, ctx) => matterOf(life, ctx)?.title ?? "A task at work",
    body: (g, life, ctx) =>
      fill(
        g,
        life,
        matterOf(life, ctx)?.body ?? "Something wants doing at work.",
      ),
    choices: [
      {
        label: (g, life, ctx) => matterOf(life, ctx)?.go ?? "Take it on",
        tip: (g, life) =>
          `Done well: about ${Math.round(wageOfRung(life) * 0.7 + 1)} coins, skill and your master's good word. Botched: stress and a black mark.`,
        check: {
          skill: (g, life, ctx) => skillFor(life, matterOf(life, ctx), false),
          dc: (g, life) => dcOf(life, false),
        },
        apply: (g, life, ctx, pass) => {
          const sk = skillFor(life, matterOf(life, ctx), false);
          if (pass) {
            earn(g, life, Math.round(wageOfRung(life) * 0.7 + 1));
            gainXp(g, life, sk, 14, true);
            if ((life.job?.rank ?? 0) >= 2) addRenown(g, life, 1);
            bossNotes(g, life, "Did fine work", 8);
            journal(g, life, "It went well, and people noticed.", "good");
          } else {
            addStress(g, life, 6);
            gainXp(g, life, sk, 6, true);
            bossNotes(g, life, "Botched a job", -6);
            journal(
              g,
              life,
              "It went badly, and people noticed that too.",
              "bad",
            );
          }
        },
      },
      {
        label: (g, life, ctx) => matterOf(life, ctx)?.safe ?? "Do it carefully",
        tip: "No risk: a little skill and a little credit.",
        apply: (g, life, ctx) => {
          gainXp(g, life, skillFor(life, matterOf(life, ctx), false), 6, true);
          bossNotes(g, life, "Steady hand", 3);
          addStress(g, life, 2);
        },
      },
      {
        label: (g, life, ctx) => matterOf(life, ctx)?.skip ?? "Leave it",
        tip: "Nothing ventured. Your master may think less of you.",
        apply: (g, life) => {
          bossNotes(g, life, "Wouldn't take it on", -3);
          addStress(g, life, -2);
        },
      },
    ],
  },
  {
    key: "work-trouble",
    pool: "raised",
    cooldown: 0,
    title: (g, life, ctx) => matterOf(life, ctx)?.title ?? "Trouble at work",
    body: (g, life, ctx) =>
      fill(
        g,
        life,
        matterOf(life, ctx)?.body ?? "Something has gone wrong at work.",
      ),
    choices: [
      {
        label: (g, life, ctx) => matterOf(life, ctx)?.go ?? "Deal with it",
        tip: "Handled: credit and a little renown. Mishandled: it costs you, in coins or in health.",
        check: {
          skill: (g, life, ctx) => skillFor(life, matterOf(life, ctx), true),
          dc: (g, life) => dcOf(life, true),
        },
        apply: (g, life, ctx, pass) => {
          const sk = skillFor(life, matterOf(life, ctx), true);
          gainXp(g, life, sk, pass ? 12 : 6, true);
          if (pass) {
            addRenown(g, life, 1);
            bossNotes(g, life, "Sorted out a mess", 6);
            journal(g, life, "You put it right.", "good");
          } else if (g.rng.chance(0.5)) {
            spend(g, life, Math.round(wageOfRung(life) * 0.5));
            addStress(g, life, 5);
            journal(g, life, "It cost you, and it isn't over.", "bad");
          } else {
            addStress(g, life, 5);
            hurt(g, life, 6, "an accident at work");
            journal(g, life, "You came off worst.", "bad");
          }
        },
      },
      {
        label: (g, life, ctx) => matterOf(life, ctx)?.safe ?? "The careful way",
        tip: (g, life) =>
          `Costs about ${Math.max(1, Math.round(wageOfRung(life) * 0.4))} coins (or your master's patience); settled.`,
        apply: (g, life) => {
          spend(g, life, Math.max(1, Math.round(wageOfRung(life) * 0.4)));
          addStress(g, life, 1);
        },
      },
      {
        label: (g, life, ctx) => matterOf(life, ctx)?.skip ?? "Let it be",
        tip: "Maybe it sorts itself out. Maybe not.",
        apply: (g, life) => {
          if (g.rng.chance(0.5)) {
            addStress(g, life, 4);
            bossNotes(g, life, "Let things slide", -5);
            journal(g, life, "It got worse.", "bad");
          } else journal(g, life, "It blew over.");
        },
      },
    ],
  },
  {
    key: "work-shirk",
    pool: "raised",
    cooldown: 0,
    scene: (g, life) => life.job?.place ?? "home",
    title: "Caught idling",
    body: (g, life, ctx) => {
      const boss = g.s.chars[ctx.c];
      return `${boss ? charName(boss) : "Your master"} has caught you idling three times this month. "I don't pay you to lean on things," ${boss?.female ? "she" : "he"} says, and waits to hear what you'll say.`;
    },
    choices: [
      {
        label: "Promise to do better",
        tip: "Back to steady work; they think a little better of you.",
        apply: (g, life, ctx) => {
          if (life.work) life.work.effort = "steady";
          const boss = g.s.chars[ctx.c];
          if (boss?.alive)
            remembers(g, life, boss, "Mended their ways", 5, 0.5);
        },
      },
      {
        label: "Talk your way out of it",
        tip: "Persuade them you were resting a strained back.",
        check: { skill: "persuasion", dc: 7 },
        apply: (g, life, ctx, pass) => {
          const boss = g.s.chars[ctx.c];
          if (!boss?.alive) return;
          if (pass) remembers(g, life, boss, "Shirks", 0, 0.1);
          else remembers(g, life, boss, "Lies to my face", -10, 1);
        },
      },
      {
        label: "Shrug",
        tip: "Keep shirking. They won't keep you long like this.",
        apply: (g, life, ctx) => {
          const boss = g.s.chars[ctx.c];
          if (boss?.alive)
            remembers(g, life, boss, "Idle and insolent", -15, 1);
          addStress(g, life, -3);
        },
      },
    ],
  },
];

/** Matter scenes by trade: where they happen. */
export function matterScene(life: Life): string {
  return life.job?.place ?? "home";
}

for (const def of WORK_EVENTS)
  if (def.key !== "work-shirk") def.scene = (g, life) => matterScene(life);

/**
 * A working day may bring a matter: a task or a trouble of your trade's own.
 * About one a month, more if you work hard (more is asked of the keen).
 */
export function workMatter(
  g: ConquestGame,
  life: Life,
  raise: (key: string, ctx: Record<string, number>) => void,
): void {
  const job = life.job;
  if (!job || !MATTERS[job.kind] || life.events.length) return;
  if (!matterDue(g.s, life)) return;
  const effort = life.work?.effort ?? "steady";
  const chance =
    effort === "hard" || effort === "overtime"
      ? 1 / 18
      : effort === "shirk"
        ? 1 / 40
        : 1 / 26;
  if (!g.rng.chance(chance)) return;
  noteMatter(g, life);
  const trouble = g.rng.chance(effort === "shirk" ? 0.65 : 0.45);
  raise(trouble ? "work-trouble" : "work-task", { t: trouble ? 1 : 0 });
}
