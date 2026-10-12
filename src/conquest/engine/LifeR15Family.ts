// EVENTS (r15): the times of a life and the people in it. A child's dares
// and scrapes; the first wages and the first dance; forty; the rheumatism,
// the memoirs and the will; and the family: a husband or wife of twenty
// years, a child's first steps and first black eye, a daughter's suitor, the
// in-laws, a brother home with a parrot and a debt (only if he really is
// short), grandchildren. Nobody in them is ever another player.

import { wouldBeg } from "./EventPacing";
import { setTie } from "./LifeCore";
import type { LifeEventDef } from "./LifeEvents";
import {
  adult,
  age,
  atHome,
  cap,
  child,
  colonist,
  costs,
  fx,
  grandkids,
  he,
  him,
  kids,
  like,
  local,
  me,
  months,
  native,
  old,
  poor,
  say,
  sibling,
  spouse,
  town,
  who,
  young,
} from "./LifeR15Kit";
import { ageOf, charName } from "./Queries";

const REST = 1460;

export const FAMILY_EVENTS: LifeEventDef[] = [
  // ------------------------------------------------ a child's life
  {
    key: "youth-dare",
    pool: "any",
    cooldown: REST,
    when: (g, life) => (child(g, life) && age(g, life) >= 8 ? {} : null),
    scene: "road",
    title: "The dare",
    body: () =>
      "The big children have dared you to touch the gibbet at the crossroads after dark, where the highwayman hung all last summer and some say still walks. They'll be watching from the hedge. So, possibly, will he.",
    choices: [
      {
        label: "Do it",
        tip: "Fighting (nerve): the gang's respect, and courage for life. Fail: a fright you'll remember.",
        check: { skill: "fighting", dc: 4 },
        apply: (g, life, _c, pass) => {
          if (pass) {
            fx(g, life, { renown: 0.5, gain: "brave", stress: -2 });
            say(
              g,
              life,
              "You touched it, and walked back. Walked. The gang talks of nothing else.",
              "good",
            );
          } else {
            fx(g, life, { stress: 8 });
            say(
              g,
              life,
              "Something moved on the gibbet. You were home before you knew you'd run.",
              "bad",
            );
          }
        },
      },
      {
        label: "Say it's a fool's dare",
        tip: "Persuasion: they think you're wise. Or a coward.",
        check: { skill: "persuasion", dc: 4 },
        apply: (g, life, _c, pass) => {
          fx(g, life, { xp: { persuasion: 8 }, stress: pass ? -2 : 4 });
          say(
            g,
            life,
            pass
              ? "They decided it was a fool's dare too, after a while."
              : "They called you chicken for a month.",
          );
        },
      },
      {
        label: "Tell your mother",
        tip: "Safe. Unforgivable, the gang says.",
        apply: (g, life) => {
          fx(g, life, { stress: 3 });
          say(
            g,
            life,
            "Your mother told their mothers. You'll be playing alone for a while.",
          );
        },
      },
    ],
  },
  {
    key: "youth-hornbook",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      child(g, life) && colonist(g, life) && age(g, life) <= 12 ? {} : null,
    scene: "church",
    title: "The goose on the hornbook",
    body: () =>
      "You drew the dame as a goose in the margin of your hornbook, and it was a very good goose, and she has found it, and she is standing over you with the birch.",
    choices: [
      {
        label: "Say you're sorry, and mean it",
        tip: "Letters: she keeps you in to copy your letters, and you learn them.",
        apply: (g, life) => {
          fx(g, life, { xp: { letters: 12 }, stress: 2 });
          say(
            g,
            life,
            'A hundred lines of "I must not draw geese", in a fair round hand.',
          );
        },
      },
      {
        label: "Say it was the boy beside you",
        tip: "Stealth: believed, and he's birched. Not believed: you're birched twice.",
        check: { skill: "stealth", dc: 5 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { xp: { stealth: 10 } } : { stress: 6, health: -2 },
          );
          say(
            g,
            life,
            pass
              ? "He was birched. You feel bad about it, a little."
              : "Twice. And the goose was confiscated.",
            pass ? undefined : "bad",
          );
        },
      },
      {
        label: "Tell her it's a good likeness",
        tip: "Persuasion: she laughs. Or she doesn't.",
        check: { skill: "persuasion", dc: 6 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { renown: 0.3, stress: -3 } : { stress: 6, health: -2 },
          );
          say(
            g,
            life,
            pass
              ? "She looked at the goose a long time, and laughed till she cried. She kept it."
              : "She didn't laugh.",
            pass ? "good" : "bad",
          );
        },
      },
    ],
  },
  {
    key: "youth-apples",
    pool: "any",
    cooldown: REST,
    when: (g, life) => (child(g, life) && months(7, 9)(g) ? {} : null),
    scene: "fields",
    title: "Apples over the wall",
    body: () =>
      "The best apples in the parish hang over the wall of a man who keeps a dog the size of a calf, and the dog is asleep, and the apples are not.",
    choices: [
      {
        label: "Over the wall",
        tip: "Stealth: a shirtful of apples. Fail: the dog, and the seat of your breeches.",
        check: { skill: "stealth", dc: 4 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass
              ? { xp: { stealth: 12 }, stress: -4 }
              : { health: -4, stress: 5 },
          );
          say(
            g,
            life,
            pass
              ? "A shirtful of apples and a clean getaway. They taste better stolen."
              : "The dog woke. You left the seat of your breeches on the wall.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Knock at the gate and ask",
        tip: "Persuasion: he may give you some, and remember you kindly.",
        check: { skill: "persuasion", dc: 5 },
        apply: (g, life, _c, pass) => {
          fx(g, life, { xp: { persuasion: 8 } });
          say(
            g,
            life,
            pass
              ? "He gave you a basket and told you he'd been young once, which seemed unlikely."
              : "He set the dog on you. Asking, it turns out, isn't always better.",
          );
        },
      },
      {
        label: "Pick up the windfalls in the lane",
        tip: "Honest apples, with wasps in.",
        apply: (g, life) => {
          fx(g, life, { stress: -2 });
          say(g, life, "Windfalls, bruised and sweet. Only one wasp.");
        },
      },
    ],
  },
  {
    key: "youth-stray",
    pool: "any",
    cooldown: REST,
    when: (g, life) => (child(g, life) && atHome(g, life) ? {} : null),
    scene: "home",
    title: "A dog follows you home",
    body: () =>
      "A thin yellow dog with one ear up and one ear down has followed you all the way home and is now sitting on the step, looking at the door as if it lived here.",
    choices: [
      {
        label: "Beg to keep him",
        tip: "Persuasion on your family: a dog of your own, and a friend.",
        check: { skill: "persuasion", dc: 4 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { stress: -10, xp: { woodcraft: 6 } } : { stress: 4 },
          );
          say(
            g,
            life,
            pass
              ? "He's yours. He sleeps on your feet and eats your shoes."
              : "No dogs. He waits on the step for three days, and then he's gone.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Feed him and send him off",
        tip: "A kindness; the dog's opinion of you is excellent.",
        apply: (g, life) => {
          fx(g, life, { stress: -3 });
          say(
            g,
            life,
            "Half your supper and a pat. He went off with his tail up.",
          );
        },
      },
    ],
  },
  {
    key: "youth-punch",
    pool: "any",
    cooldown: REST,
    when: (g, life) => (child(g, life) && town(g, life) ? {} : null),
    scene: "market",
    title: "A penny at the fair",
    body: () =>
      "You have a whole penny and the fair is on: gingerbread men with gilt buttons, a puppet show where Punch beats the constable, and a man with a monkey who will tell your fortune.",
    choices: [
      {
        label: "Gingerbread",
        tip: "Happiness, for about four minutes.",
        apply: (g, life) => {
          fx(g, life, { stress: -6 });
          say(g, life, "You ate the buttons first.");
        },
      },
      {
        label: "The puppet show",
        tip: "Punch's patter: persuasion, of a sort.",
        apply: (g, life) => {
          fx(g, life, { stress: -4, xp: { persuasion: 8 } });
          say(
            g,
            life,
            "You can do Punch's voice now. Your family have asked you not to.",
          );
        },
      },
      {
        label: "Save it",
        tip: "A penny saved. Diligence is its own reward, they say.",
        apply: (g, life) => {
          fx(g, life, { coins: 0.1, xp: { trade: 6 } });
          say(
            g,
            life,
            "You kept the penny. You looked at the gingerbread for a long time, though.",
          );
        },
      },
    ],
  },
  {
    key: "youth-fishing",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      if (!child(g, life)) return null;
      const c = local(g, life, 11, (x) => !x.female && ageOf(g.s, x) >= 55);
      return c ? { c: c.id } : null;
    },
    scene: "road",
    title: "The old man at the creek",
    body: (g, life, ctx) =>
      `${charName(g.s.chars[ctx.c])} fishes the creek every morning and catches more than anyone, and has never said why. This morning ${he(g.s.chars[ctx.c])} has looked at you, and moved over on the log.`,
    choices: [
      {
        label: "Sit and learn",
        tip: "Woodcraft, patience, and a friend for life (+20).",
        apply: (g, life, ctx) => {
          fx(g, life, { xp: { woodcraft: 15 }, stress: -5 });
          like(g, life, ctx, "Sat with me at the creek", 20, 10);
          say(
            g,
            life,
            "The secret is worms, and keeping your mouth shut. Mostly the second.",
            "good",
          );
        },
      },
      {
        label: "Ask too many questions",
        tip: "Persuasion: you learn a great deal, about the old days mostly.",
        apply: (g, life, ctx) => {
          fx(g, life, { xp: { persuasion: 8 } });
          like(g, life, ctx, "A talker", 5, 3);
          say(
            g,
            life,
            "No fish, but you know all about the hard winter of ninety-seven.",
          );
        },
      },
    ],
  },
  // ------------------------------------------------ young and grown
  {
    key: "young-first-wages",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      young(g, life) && life.job && (life.tally.earned ?? 0) < 40 ? {} : null,
    scene: "market",
    title: "Your own money",
    body: () =>
      "Your first real wages, counted out into your own hand, and every shop in the street seems to know it.",
    choices: [
      {
        label: costs("A coat fit for Sundays", 3),
        tip: "You look the part: renown, and the girls (or the boys) look twice.",
        blocked: (g, life) => poor(life, 3),
        apply: (g, life) => {
          fx(g, life, { coins: -3, renown: 1, stress: -4 });
          say(
            g,
            life,
            "Brass buttons. You keep catching yourself in shop windows.",
            "good",
          );
        },
      },
      {
        label: "Put it by",
        tip: "Trade: you learn the habit early.",
        apply: (g, life) => {
          fx(g, life, { xp: { trade: 12 } });
          say(
            g,
            life,
            "Into the stocking under the floorboard. It feels like a beginning.",
          );
        },
      },
      {
        label: costs("Stand your workmates a round", 1),
        tip: "Friends, and a head in the morning.",
        blocked: (g, life) => poor(life, 1),
        apply: (g, life) => {
          fx(g, life, { coins: -1, stress: -8, renown: 0.5 });
          say(
            g,
            life,
            "You're a good fellow, they all said, several times each.",
          );
        },
      },
    ],
  },
  {
    key: "young-assembly",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      if (!young(g, life) || !town(g, life) || me(g, life).spouse >= 0)
        return null;
      const m = me(g, life);
      const c = local(
        g,
        life,
        23,
        (x) => x.female !== m.female && x.spouse < 0 && ageOf(g.s, x) <= 28,
      );
      return c ? { c: c.id } : null;
    },
    scene: "tavern",
    title: "The dancing assembly",
    body: (g, life, ctx) => {
      const c = g.s.chars[ctx.c];
      return `The long room upstairs at the tavern, candles in the sconces, two fiddles and a hautboy, and the whole of the town's young folk in their best. ${charName(c)} is across the room, not dancing, and has looked your way twice.`;
    },
    choices: [
      {
        label: "Ask for the next dance",
        tip: "Persuasion: a dance, and perhaps more (+15 opinion; you've met). Fail: you trod on everything.",
        check: { skill: "persuasion", dc: 6 },
        apply: (g, life, ctx, pass) => {
          const c = who(g, ctx);
          if (c && !life.met.includes(c.id)) life.met.push(c.id);
          if (pass) {
            like(g, life, ctx, "Danced with me at the assembly", 15, 3);
            fx(g, life, { stress: -8 });
            say(
              g,
              life,
              `You danced the whole of "Sir Roger de Coverley" with ${c?.first ?? "them"}, and nobody else in the room existed.`,
              "good",
            );
          } else {
            fx(g, life, { stress: 5 });
            say(
              g,
              life,
              "You trod on a foot, a hem and, somehow, the fiddler.",
              "bad",
            );
          }
        },
      },
      {
        label: "Hold up the wall with the other cowards",
        tip: "Safe, and the punch is good.",
        apply: (g, life) => {
          fx(g, life, { stress: -2 });
          say(g, life, "A fine evening, viewed from the wall.");
        },
      },
      {
        label: "Slip out to the garden",
        tip: "Stealth: a stolen hour. Caught: talk.",
        check: { skill: "stealth", dc: 6 },
        apply: (g, life, ctx, pass) => {
          if (pass) {
            like(g, life, ctx, "A walk in the garden", 20, 3);
            fx(g, life, { stress: -10 });
            say(
              g,
              life,
              "The garden, the moon, a bench. Nobody saw. Probably.",
              "good",
            );
          } else {
            fx(g, life, { renown: -1, stress: 4 });
            say(
              g,
              life,
              "Half the assembly saw. The other half heard by breakfast.",
              "bad",
            );
          }
        },
      },
    ],
  },
  {
    key: "young-old-hand",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      if (!young(g, life) || Object.values(life.ties).includes("mentor"))
        return null;
      const c = local(g, life, 37, (x) => !!x.role && ageOf(g.s, x) >= 40);
      return c ? { c: c.id } : null;
    },
    title: "An old hand",
    body: (g, life, ctx) => {
      const c = g.s.chars[ctx.c];
      return `${charName(c)} has watched you for a while, the way old hands do, and says at last: "You've the makings, if someone showed you. I could. If you'll be told."`;
    },
    choices: [
      {
        label: "Be told",
        tip: "A mentor: they teach you their calling month by month.",
        apply: (g, life, ctx) => {
          const c = who(g, ctx);
          if (!c) return;
          setTie(g, life, c.id, "mentor");
          like(g, life, ctx, "Took my teaching", 15, 5);
          say(
            g,
            life,
            `${charName(c)} is your teacher now. ${cap(he(c))} has a great deal to say about how you hold things.`,
            "good",
          );
        },
      },
      {
        label: "Thank them, and go your own way",
        tip: "Nothing changes. They think you proud.",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Too proud to learn", -5, 2);
          say(
            g,
            life,
            "Your own way. You'll find out what they'd have told you.",
          );
        },
      },
    ],
  },
  {
    key: "young-wager",
    pool: "any",
    cooldown: REST,
    when: (g, life) => (young(g, life) && adult(g, life) ? {} : null),
    scene: "tavern",
    title: "A foolish wager",
    body: () =>
      "It was said, late, that you couldn't run from the tavern to the church steeple and back before the landlord drank a quart. It was said loudly. Money is on the table.",
    choices: [
      {
        label: costs("Take the bet", 2),
        tip: "Fighting (wind): double your stake, and the town's admiration. Lose: 2 coins and your dignity.",
        check: { skill: "fighting", dc: 6 },
        blocked: (g, life) => poor(life, 2),
        apply: (g, life, _c, pass) => {
          if (pass) {
            fx(g, life, { coins: 2, renown: 1, health: -1 });
            say(
              g,
              life,
              "Back with the landlord's quart half drunk. The tavern roared.",
              "good",
            );
          } else {
            fx(g, life, { coins: -2, stress: 3 });
            say(
              g,
              life,
              "The landlord finished the quart and ordered another while you were still at the steeple.",
              "bad",
            );
          }
        },
      },
      {
        label: "Bet the other way",
        tip: "Trade: a canny wager on the landlord's thirst.",
        check: { skill: "trade", dc: 5 },
        apply: (g, life, _c, pass) => {
          fx(g, life, pass ? { coins: 1.5, xp: { trade: 8 } } : { coins: -1 });
          say(
            g,
            life,
            pass
              ? "The landlord was a reliable drinker. You were a reliable judge of him."
              : "The runner was faster than he looked.",
          );
        },
      },
      {
        label: "Go home to bed",
        tip: "Wisdom, for once.",
        apply: (g, life) => {
          fx(g, life, { stress: -2 });
          say(
            g,
            life,
            "You heard about it in the morning. Somebody fell in the horse trough.",
          );
        },
      },
    ],
  },
  {
    key: "young-second",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      if (!young(g, life) || !colonist(g, life)) return null;
      const id = Object.entries(life.ties).find(([k, t]) => {
        const c = g.s.chars[Number(k)];
        return t === "friend" && c?.alive && !c.female && c.home === life.prov;
      })?.[0];
      return id !== undefined ? { c: Number(id) } : null;
    },
    scene: "tavern",
    title: "Will you be my second?",
    body: (g, life, ctx) => {
      const c = g.s.chars[ctx.c];
      return `${charName(c)} has quarrelled with a man over a horse, or a woman, or a horse belonging to a woman, and is to fight him at dawn. "You'll stand second for me," ${he(c)} says. It isn't a question.`;
    },
    choices: [
      {
        label: "Stand second, and try for peace",
        tip: "Persuasion: no blood spilt, and both think well of you. Fail: they fight; your friend is grateful.",
        check: { skill: "persuasion", dc: 7 },
        apply: (g, life, ctx, pass) => {
          like(g, life, ctx, "Stood by me at dawn", pass ? 20 : 12, 5);
          fx(g, life, pass ? { renown: 2 } : { stress: 6 });
          say(
            g,
            life,
            pass
              ? "An apology, a handshake, breakfast. Seconds are for this."
              : "They fired. Both missed, and both claimed satisfaction.",
            pass ? "good" : undefined,
          );
        },
      },
      {
        label: "Refuse",
        tip: "The law's on your side. Your friend isn't (−20).",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Left me without a second", -20, 4);
          fx(g, life, { stress: 2 });
          say(
            g,
            life,
            "He found another second, and another friend, it seems.",
          );
        },
      },
    ],
  },
  // ------------------------------------------------ the middle of life
  {
    key: "prime-forty",
    pool: "any",
    cooldown: 99999,
    when: (g, life) => (age(g, life) >= 40 && age(g, life) <= 42 ? {} : null),
    scene: "home",
    title: "Forty",
    body: () =>
      "You're forty. Your father was old at forty. You look in the glass and a stranger with your face looks back, a little thicker about the middle, with a question in his eye.",
    choices: [
      {
        label: "Resolve to do great things yet",
        tip: "You become ambitious (unless you're content), and restless (+6 stress).",
        apply: (g, life) => {
          fx(g, life, { gain: "ambitious", stress: 6 });
          say(g, life, "Half a life left. You mean to use it.", "good");
        },
      },
      {
        label: "Count your blessings",
        tip: "You become content (unless ambitious), and easier (−10 stress).",
        apply: (g, life) => {
          fx(g, life, { gain: "content", stress: -10 });
          say(
            g,
            life,
            "A roof, a table, people who'd miss you. Forty is no great age.",
            "good",
          );
        },
      },
      {
        label: costs("Buy a new wig", 2),
        tip: "The young look of the town: +1 renown.",
        blocked: (g, life) => poor(life, 2),
        apply: (g, life) => {
          fx(g, life, { coins: -2, renown: 1 });
          say(
            g,
            life,
            "A bob wig, very much the fashion. You look thirty-nine.",
          );
        },
      },
    ],
  },
  // ------------------------------------------------ old age
  {
    key: "age-rheum",
    pool: "any",
    cooldown: REST,
    when: (g, life) => (old(g, life) ? {} : null),
    scene: "home",
    title: "The rheumatism",
    body: () =>
      "Your knees have joined the opposition. Every damp morning they make speeches, and the stairs have become a parliament of complaint.",
    choices: [
      {
        label: costs("Take the waters", 4),
        tip: "A spa or a warm spring: +8 health, −6 stress.",
        blocked: (g, life) => poor(life, 4),
        apply: (g, life) => {
          fx(g, life, { coins: -4, health: 8, stress: -6 });
          say(
            g,
            life,
            "A fortnight of foul-tasting water and fine company. The knees sit quieter.",
            "good",
          );
        },
      },
      {
        label: "Flannel and a warm brick",
        tip: "Cheap, and it helps a little (+3 health).",
        apply: (g, life) => {
          fx(g, life, { health: 3 });
          say(
            g,
            life,
            "Red flannel round both knees. You look ridiculous and feel better.",
          );
        },
      },
      {
        label: "Walk it off, every morning",
        tip: "Fighting (grit): +6 health, and the town sees you're not done yet.",
        check: { skill: "fighting", dc: 6 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { health: 6, renown: 0.5 } : { health: -3, stress: 3 },
            "the rheumatism",
          );
          say(
            g,
            life,
            pass
              ? "A mile every morning. The knees grumble and obey."
              : "A mile on the first morning, and then a week in bed.",
            pass ? "good" : "bad",
          );
        },
      },
    ],
  },
  {
    key: "age-memoirs",
    pool: "any",
    cooldown: 99999,
    when: (g, life) =>
      old(g, life) && life.skills.letters >= 3 && life.renown >= 10 ? {} : null,
    scene: "home",
    title: "Your memoirs",
    body: () =>
      'The printer has asked, very civilly, whether a person of your experience has ever thought of setting it down: "A Narrative of the Life and Adventures of…". There\'s a market for such things. Especially the adventures.',
    choices: [
      {
        label: "Write the truth",
        tip: "Letters: an honest book (+3 renown, letters). Some of it won't please everyone.",
        check: { skill: "letters", dc: 7 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass
              ? { renown: 3, coins: 3, xp: { letters: 20 } }
              : { renown: 1, xp: { letters: 12 } },
          );
          say(
            g,
            life,
            pass
              ? "It sold out in a month. Three people have stopped speaking to you; it was worth it."
              : "It came out dull, the way the truth sometimes does.",
            pass ? "good" : undefined,
          );
        },
      },
      {
        label: "Write it as it ought to have been",
        tip: "Persuasion: a rattling good read (+4 renown, 5 coins). Found out: a laughing stock.",
        check: { skill: "persuasion", dc: 8 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { renown: 4, coins: 5 } : { renown: -3, stress: 6 },
          );
          say(
            g,
            life,
            pass
              ? "You fought a bear in chapter four. Nobody can prove you didn't."
              : "Someone who was there wrote to the gazette.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Decline: some things are nobody's business",
        tip: "Your secrets die with you.",
        apply: (g, life) => {
          fx(g, life, { stress: -3 });
          say(
            g,
            life,
            "Some things are nobody's business. Most things, at your age.",
          );
        },
      },
    ],
  },
  {
    key: "age-advice",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      if (!old(g, life)) return null;
      const c = local(g, life, 41, (x) => ageOf(g.s, x) <= 30 && !x.female);
      return c ? { c: c.id } : null;
    },
    scene: "tavern",
    title: "Young men with a scheme",
    body: (g, life, ctx) =>
      `${charName(g.s.chars[ctx.c])} and two friends have a scheme (a mill on the falls, a voyage, a new road, it scarcely matters) and have come to ask an old head what it thinks. They've already decided, of course; they want to be told they're right.`,
    choices: [
      {
        label: "Tell them honestly what's wrong with it",
        tip: "Persuasion: they listen (+10 opinion, +1 renown). Fail: they think you an old fool.",
        check: { skill: "persuasion", dc: 6 },
        apply: (g, life, ctx, pass) => {
          like(
            g,
            life,
            ctx,
            pass ? "Gave me good counsel" : "An old fool",
            pass ? 10 : -5,
            3,
          );
          fx(g, life, pass ? { renown: 1, stress: -3 } : { stress: 3 });
          say(
            g,
            life,
            pass
              ? "They changed the plan. It might even work now."
              : "They went ahead. You'll be sorry to be right.",
          );
        },
      },
      {
        label: "Tell them it's splendid",
        tip: "They love you (+15). What happens next is their affair.",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Believed in us", 15, 3);
          say(g, life, "Splendid, you said. Their faces made it worth it.");
        },
      },
      {
        label: costs("Put money in it", 5),
        tip: "The chance it comes off: 40%, and you get 12 back. Otherwise it's gone.",
        blocked: (g, life) => poor(life, 5),
        apply: (g, life, ctx) => {
          fx(g, life, { coins: -5 });
          like(g, life, ctx, "Backed us with silver", 20, 5);
          if (g.rng.chance(0.4)) {
            fx(g, life, { coins: 12 });
            say(
              g,
              life,
              "It came off. They paid you back with interest and a speech.",
              "good",
            );
          } else
            say(
              g,
              life,
              "It didn't come off. They're very sorry, and so is your purse.",
              "bad",
            );
        },
      },
    ],
  },
  {
    key: "age-will",
    pool: "any",
    cooldown: 99999,
    when: (g, life) =>
      old(g, life) && colonist(g, life) && life.purse >= 20 ? {} : null,
    scene: "home",
    title: "Making a will",
    body: () =>
      'The attorney sits at your table with a fresh quill, "In the name of God, Amen. I, being weak in body but of sound and perfect mind…" and waits for you to say who gets what. The family are in the next room, being very quiet.',
    choices: [
      {
        label: costs("A bequest to the poor of the parish", 5),
        tip: "+3 renown; the minister will say so at the funeral.",
        blocked: (g, life) => poor(life, 5),
        apply: (g, life) => {
          fx(g, life, { coins: -5, renown: 3, stress: -4 });
          say(
            g,
            life,
            "Five coins for bread for the poor, every Christmas, in your name.",
            "good",
          );
        },
      },
      {
        label: "Everything to the heir, plainly",
        tip: "No quarrels after (−4 stress).",
        apply: (g, life) => {
          fx(g, life, { stress: -4 });
          say(
            g,
            life,
            "Plain and fair. The attorney looked almost disappointed.",
          );
        },
      },
      {
        label: "Something for everyone, with conditions",
        tip: "Letters: the family behave beautifully for years. Botched: a lawsuit in the making.",
        check: { skill: "letters", dc: 7 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { stress: -6, xp: { letters: 10 } } : { stress: 6 },
          );
          say(
            g,
            life,
            pass
              ? "Every child behaves beautifully now, and visits on Sundays."
              : "Conditions, it turns out, are what lawyers live on.",
          );
        },
      },
    ],
  },
  {
    key: "age-spectacles",
    pool: "any",
    cooldown: 99999,
    when: (g, life) => (age(g, life) >= 48 && colonist(g, life) ? {} : null),
    scene: "market",
    title: "Spectacles",
    body: () =>
      "The print in the gazette has been getting smaller for years, and the candles dimmer. A peddler has a tray of spectacles in steel frames; you try them on one after another, and the world comes back.",
    choices: [
      {
        label: costs("Buy the best pair", 2),
        tip: "Letters again: +15 letters, and you can read the gazette (and the bill).",
        blocked: (g, life) => poor(life, 2),
        apply: (g, life) => {
          fx(g, life, { coins: -2, xp: { letters: 15 }, stress: -3 });
          say(
            g,
            life,
            "Steel spectacles. You read the whole gazette, including the advertisements, out of sheer joy.",
            "good",
          );
        },
      },
      {
        label: "Hold the paper at arm's length",
        tip: "Vanity is free.",
        apply: (g, life) => {
          fx(g, life, { stress: 2 });
          say(g, life, "Your arms, it turns out, are also getting shorter.");
        },
      },
    ],
  },
  // ------------------------------------------------ the family
  {
    key: "kin-anniversary",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      const sp = spouse(g, life);
      return sp && age(g, life) >= 38 ? { c: sp.id } : null;
    },
    scene: "home",
    title: "Twenty years",
    body: (g, life, ctx) => {
      const c = g.s.chars[ctx.c];
      return `It's twenty years, near enough, since you and ${charName(c)} stood up in church. ${cap(he(c))} hasn't said anything about it, which is how you know ${he(c)} remembers exactly.`;
    },
    choices: [
      {
        label: costs("A gift, and a dinner", 4),
        tip: "+20 opinion, −8 stress.",
        blocked: (g, life) => poor(life, 4),
        apply: (g, life, ctx) => {
          fx(g, life, { coins: -4, stress: -8 });
          like(g, life, ctx, "Remembered our years", 20, 5);
          say(
            g,
            life,
            "A silver thimble (or a snuffbox) and a goose for dinner. Twenty years well spent.",
            "good",
          );
        },
      },
      {
        label: "A walk, the two of you, like the old days",
        tip: "+12 opinion, −5 stress.",
        apply: (g, life, ctx) => {
          fx(g, life, { stress: -5 });
          like(g, life, ctx, "Walked out with me again", 12, 3);
          say(
            g,
            life,
            "Down by the river, where you used to walk. Neither of you said much. Neither needed to.",
          );
        },
      },
      {
        label: "Forget",
        tip: "−15 opinion. You'll hear of it.",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Forgot our years", -15, 3);
          fx(g, life, { stress: 4 });
          say(g, life, "You forgot. You were reminded. At length.", "bad");
        },
      },
    ],
  },
  {
    key: "kin-first-steps",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      const k = kids(g, life, 1, 1)[0];
      return k && atHome(g, life) ? { c: k.id } : null;
    },
    scene: "home",
    title: "First steps",
    body: (g, life, ctx) => {
      const k = g.s.chars[ctx.c];
      return `${k?.first ?? "The baby"} let go of the table leg, looked at you with enormous seriousness, and took three steps across the floor, and sat down hard, and laughed.`;
    },
    choices: [
      {
        label: "Drop everything and play",
        tip: "−12 stress; the child adores you (+15).",
        apply: (g, life, ctx) => {
          fx(g, life, { stress: -12 });
          like(g, life, ctx, "Played with me", 15, 10);
          say(
            g,
            life,
            "The whole afternoon on the floor. The work can wait. It did.",
            "good",
          );
        },
      },
      {
        label: "Write it in the family Bible",
        tip: "Letters; the day is kept.",
        apply: (g, life) => {
          fx(g, life, { xp: { letters: 6 }, stress: -6 });
          say(
            g,
            life,
            "Set down on the flyleaf, between the births and the deaths, where good days belong.",
          );
        },
      },
    ],
  },
  {
    key: "kin-question",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      const k = kids(g, life, 4, 9)[0];
      return k ? { c: k.id } : null;
    },
    scene: "home",
    title: "A child's question",
    body: (g, life, ctx) => {
      const k = g.s.chars[ctx.c];
      return `${k?.first ?? "Your child"} has been very quiet at supper, and then asks: "When grandmother died, where did she go? Can she see us? Does she still have her cat?"`;
    },
    choices: [
      {
        label: "Answer from the Bible (or the old stories)",
        tip: "Faith: the child is comforted (+10).",
        check: { skill: "faith", dc: 4 },
        apply: (g, life, ctx, pass) => {
          fx(g, life, { xp: { faith: 10 } });
          like(g, life, ctx, "Told me true things", pass ? 10 : 4, 5);
          say(
            g,
            life,
            pass
              ? "Heaven, you said, and yes, the cat. The child slept well."
              : "You got tangled in the cat.",
          );
        },
      },
      {
        label: "Say you don't know, and nobody does",
        tip: "Honest. The child thinks hard about it.",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Didn't lie to me", 6, 5);
          say(
            g,
            life,
            '"Nobody?" Nobody. The child seemed to find that interesting rather than frightening.',
          );
        },
      },
    ],
  },
  {
    key: "kin-black-eye",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      const k = kids(g, life, 7, 13).find((x) => !x.female);
      return k ? { c: k.id } : null;
    },
    scene: "home",
    title: "A black eye",
    body: (g, life, ctx) => {
      const k = g.s.chars[ctx.c];
      return `${k?.first ?? "Your son"} has come home with a black eye and a torn shirt and won't say who. His sister says it was the miller's boy, who said something about your family.`;
    },
    choices: [
      {
        label: "Go and see the miller",
        tip: "Persuasion: the boys are made to shake hands. Fail: you quarrel with the miller too.",
        check: { skill: "persuasion", dc: 6 },
        apply: (g, life, ctx, pass) => {
          fx(g, life, pass ? { renown: 0.5 } : { stress: 5 });
          like(g, life, ctx, "Stood up for me", 8, 5);
          say(
            g,
            life,
            pass
              ? "The boys shook hands, and were thick as thieves by Sunday."
              : "Now the fathers aren't speaking either.",
          );
        },
      },
      {
        label: "Teach him to box",
        tip: "He'll not lose the next one (+12 opinion).",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Taught me to fight", 12, 5);
          fx(g, life, { xp: { fighting: 6 } });
          say(
            g,
            life,
            "Keep your guard up and your thumb outside your fist. The miller's boy has been told.",
          );
        },
      },
      {
        label: "Tell him to turn the other cheek",
        tip: "Faith. He's not sure about it.",
        apply: (g, life, ctx) => {
          fx(g, life, { xp: { faith: 6 } });
          like(g, life, ctx, "Told me to take it", -4, 3);
          say(g, life, "He turned the other cheek. It's black now too.");
        },
      },
    ],
  },
  {
    key: "kin-suitor",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      const k = kids(g, life, 15, 22).find((x) => x.female && x.spouse < 0);
      return k ? { c: k.id } : null;
    },
    scene: "home",
    title: "A young man at the door",
    body: (g, life, ctx) => {
      const k = g.s.chars[ctx.c];
      return `A young man with his hat in his hands and his hair wetted down is at the door asking for ${k?.first ?? "your daughter"}, and ${k?.first ?? "she"} is on the stairs pretending not to listen.`;
    },
    choices: [
      {
        label: "Have him in and look him over",
        tip: "Persuasion: you find out what he's made of. Your daughter is grateful (+10).",
        check: { skill: "persuasion", dc: 5 },
        apply: (g, life, ctx, pass) => {
          like(g, life, ctx, "Was kind to my young man", 10, 3);
          fx(g, life, { stress: pass ? -2 : 3 });
          say(
            g,
            life,
            pass
              ? "He's a cooper's son with prospects and good manners. He may come on Sundays."
              : 'He spilt his tea and said "Sir" eleven times. Your daughter has never been so mortified.',
          );
        },
      },
      {
        label: "Send him off",
        tip: "Too young, too poor, too something. She'll sulk (−15).",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Sent my young man away", -15, 3);
          say(
            g,
            life,
            "Off he went. Your daughter has stopped speaking to you, which is restful, and awful.",
          );
        },
      },
      {
        label: "Let her decide",
        tip: "She thinks the world of you (+12).",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Let me choose", 12, 5);
          say(
            g,
            life,
            "She decided to walk out with him on Sundays, and to tell you nothing at all.",
          );
        },
      },
    ],
  },
  {
    key: "kin-in-laws",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      const sp = spouse(g, life);
      if (!sp || !atHome(g, life)) return null;
      const p = [g.s.chars[sp.father], g.s.chars[sp.mother]].find(
        (x) => x?.alive && !x.abroad,
      );
      return p ? { c: p.id } : null;
    },
    scene: "home",
    title: "The in-laws",
    body: (g, life, ctx) => {
      const c = g.s.chars[ctx.c];
      return `${charName(c)}, your ${c?.female ? "mother" : "father"}-in-law, has come to stay "for a few days", with a trunk that suggests a few months. ${cap(he(c))} has already rearranged the kitchen.`;
    },
    choices: [
      {
        label: "Be a perfect host",
        tip: "Persuasion: +15 opinion, and peace at home. Fail: +8 stress anyway.",
        check: { skill: "persuasion", dc: 6 },
        apply: (g, life, ctx, pass) => {
          like(g, life, ctx, "A good host to me", pass ? 15 : 5, 4);
          fx(g, life, { stress: pass ? 2 : 8, coins: -1 });
          say(
            g,
            life,
            pass
              ? "A month of perfect manners. You deserve a medal; nobody will give you one."
              : "You were perfect for nine days.",
          );
        },
      },
      {
        label: "Find urgent business elsewhere",
        tip: "Peace for you; your husband or wife is not amused.",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Never at home", -8, 2);
          const sp = spouse(g, life);
          if (sp) like(g, life, { c: sp.id }, "Left me with my parent", -8, 2);
          fx(g, life, { stress: -4 });
          say(
            g,
            life,
            "Urgent business, a fortnight of it. Remarkable how much needed doing.",
          );
        },
      },
    ],
  },
  {
    key: "kin-cousin-money",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      adult(g, life) && colonist(g, life) && life.purse >= 15 ? {} : null,
    scene: "letter",
    title: "A cousin's scheme",
    body: () =>
      "A cousin you last saw at a christening writes from the capital: silkworms. Mulberry trees, a few dozen worms, and in five years the colony will rival France. He has a share left, for family. He has enclosed a worm, which arrived dead.",
    choices: [
      {
        label: costs("Buy the share", 8),
        tip: "A 30% chance it pays 25; otherwise the worms die and so does the money.",
        blocked: (g, life) => poor(life, 8),
        apply: (g, life) => {
          fx(g, life, { coins: -8 });
          if (g.rng.chance(0.3)) {
            fx(g, life, { coins: 25 });
            say(
              g,
              life,
              "Against all reason, the worms spun. You have a silk waistcoat and a profit.",
              "good",
            );
          } else
            say(
              g,
              life,
              'The worms died in the first frost. Your cousin is "looking into indigo".',
              "bad",
            );
        },
      },
      {
        label: "Write back kindly, and no",
        tip: "Letters; family stays family.",
        apply: (g, life) => {
          fx(g, life, { xp: { letters: 6 } });
          say(g, life, "A kind letter, and no. He found another cousin.");
        },
      },
    ],
  },
  {
    key: "kin-ague",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      const k = kids(g, life, 0, 15)[0] ?? spouse(g, life);
      return k && atHome(g, life) ? { c: k.id } : null;
    },
    scene: "home",
    title: "The ague in the house",
    body: (g, life, ctx) => {
      const c = g.s.chars[ctx.c];
      return `${c?.first ?? "Someone"} is down with the ague: shaking with cold at noon, burning by supper, and the whole house up at night with cloths and broth.`;
    },
    choices: [
      {
        label: "Nurse them yourself",
        tip: "Medicine: they're well in a week (+15 opinion). Fail: you catch it too.",
        check: { skill: "medicine", dc: 5 },
        apply: (g, life, ctx, pass) => {
          like(g, life, ctx, "Nursed me through the ague", 15, 5);
          fx(
            g,
            life,
            pass
              ? { xp: { medicine: 12 }, stress: 3 }
              : { health: -8, stress: 6 },
            "the ague",
          );
          say(
            g,
            life,
            pass
              ? "Bark and broth and sitting up nights. They're mending."
              : "They're mending. You're not.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: costs("Send for the physician", 3),
        tip: "Done properly; −3 coins.",
        blocked: (g, life) => poor(life, 3),
        apply: (g, life, ctx) => {
          fx(g, life, { coins: -3, stress: 2 });
          like(g, life, ctx, "Sent for the doctor", 8, 3);
          say(
            g,
            life,
            "The physician bled them, which did no good, and gave them bark, which did.",
          );
        },
      },
    ],
  },
  {
    key: "kin-bible",
    pool: "any",
    cooldown: 99999,
    when: (g, life) => (adult(g, life) && colonist(g, life) ? {} : null),
    scene: "home",
    title: "The family Bible",
    body: () =>
      "Clearing out the chest, you find the family Bible your grandmother brought over: births, marriages and deaths on the flyleaf in four hands, a pressed flower, and a note about a debt nobody ever paid.",
    choices: [
      {
        label: "Bring the register up to date",
        tip: "Letters; your family's story goes on in your hand.",
        apply: (g, life) => {
          fx(g, life, { xp: { letters: 10 }, stress: -6 });
          say(
            g,
            life,
            "Your own name, and your children's, under your grandmother's careful hand.",
            "good",
          );
        },
      },
      {
        label: "Look into the old debt",
        tip: "Letters: 30% it's still owed, and paid: 10 coins.",
        check: { skill: "letters", dc: 8 },
        apply: (g, life, _c, pass) => {
          if (pass) {
            fx(g, life, { coins: 10, xp: { letters: 10 } });
            say(
              g,
              life,
              "The debtor's grandson paid it, out of shame and a sense of humour. Ten coins.",
              "good",
            );
          } else {
            fx(g, life, { xp: { letters: 6 } });
            say(
              g,
              life,
              "The debtor's family went to Barbados in 1680. The debt went with them.",
            );
          }
        },
      },
    ],
  },
  {
    key: "kin-brother",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      const b = sibling(g, life);
      return b && atHome(g, life) && adult(g, life) ? { c: b.id } : null;
    },
    scene: "home",
    title: "Family at the door",
    body: (g, life, ctx) => {
      const c = g.s.chars[ctx.c];
      const short = wouldBeg(g.s, c, 6);
      return `${charName(c)}, your ${c?.female ? "sister" : "brother"}, is at the door: unannounced, travel-stained, with presents for everyone (a parrot, chiefly) and stories enough for a winter. ${short ? `There is also, it comes out over supper, a small debt.` : `${cap(he(c))} has come, ${he(c)} says, simply to see you.`}`;
    },
    choices: [
      {
        label: "Kill the fatted calf",
        tip: "A feast at home: −10 stress, +15 opinion.",
        apply: (g, life, ctx) => {
          fx(g, life, { coins: -1, stress: -10 });
          like(g, life, ctx, "Made me welcome", 15, 5);
          say(
            g,
            life,
            "Stories till the candles guttered. The parrot knows a word you'll have to explain to the children.",
            "good",
          );
        },
      },
      {
        label: costs("Settle the debt", 6),
        tip: "Only if there is one: +25 opinion.",
        blocked: (g, life, ctx) =>
          wouldBeg(g.s, g.s.chars[ctx.c], 6)
            ? poor(life, 6)
            : "There's no debt to settle",
        apply: (g, life, ctx) => {
          fx(g, life, { coins: -6 });
          like(g, life, ctx, "Settled my debt", 25, 8);
          say(
            g,
            life,
            "Paid, and not a word more about it. That's what family is for, apparently.",
            "good",
          );
        },
      },
      {
        label: "Make it a short visit",
        tip: "−8 opinion. The parrot stays.",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Couldn't wait to see me gone", -8, 3);
          say(
            g,
            life,
            "Three days, and a tight smile at the gate. The parrot stayed.",
          );
        },
      },
    ],
  },
  {
    key: "kin-grandchild",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      const gk = grandkids(g, life).find((x) => ageOf(g.s, x) <= 10);
      return gk && old(g, life) ? { c: gk.id } : null;
    },
    scene: "home",
    title: "A grandchild for the day",
    body: (g, life, ctx) => {
      const c = g.s.chars[ctx.c];
      return `${c?.first ?? "A grandchild"} has been left with you for the day, and has already found the sugar loaf, your sword (or your best knife), and the one stair that creaks.`;
    },
    choices: [
      {
        label: "Spoil them shamelessly",
        tip: "−15 stress; they'll remember you all their lives (+20).",
        apply: (g, life, ctx) => {
          fx(g, life, { stress: -15, coins: -0.5 });
          like(g, life, ctx, "Spoilt me rotten", 20, 15);
          say(
            g,
            life,
            "Sugar, stories and a ride on your back to the end of the lane. Exhausting. Perfect.",
            "good",
          );
        },
      },
      {
        label: "Teach them something",
        tip: "Your best skill, a little; they'll remember who taught them (+12).",
        apply: (g, life, ctx) => {
          fx(g, life, { stress: -6 });
          like(g, life, ctx, "Taught me my first skill", 12, 15);
          say(
            g,
            life,
            "Knots, or letters, or how to tell a hawk from a crow. They listened, mostly.",
          );
        },
      },
    ],
  },
  {
    key: "kin-sampler",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      const k = kids(g, life, 8, 14).find((x) => x.female);
      return k && colonist(g, life) ? { c: k.id } : null;
    },
    scene: "home",
    title: "The sampler",
    body: (g, life, ctx) => {
      const k = g.s.chars[ctx.c];
      return `${k?.first ?? "Your daughter"} has finished her sampler: the alphabet twice, a verse, a house with a red roof, and her name and age in cross-stitch. She holds it up for you with both hands.`;
    },
    choices: [
      {
        label: costs("Have it framed for the parlour", 1),
        tip: "She's proud for a year (+15).",
        blocked: (g, life) => poor(life, 1),
        apply: (g, life, ctx) => {
          fx(g, life, { coins: -1, stress: -5 });
          like(g, life, ctx, "Framed my sampler", 15, 8);
          say(
            g,
            life,
            "It hangs in the parlour. Visitors are made to admire it, and do.",
            "good",
          );
        },
      },
      {
        label: "Point out the crooked letter",
        tip: "Accurate. Unforgivable (−10).",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Found fault with my sampler", -10, 4);
          say(
            g,
            life,
            "The Q was crooked. She will never forgive you, and will never sew a crooked Q again.",
          );
        },
      },
    ],
  },
  // ------------------------------------------------ the peoples' families
  {
    key: "kin-naming",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      const k = kids(g, life, 0, 1)[0];
      return k && native(g, life) ? { c: k.id } : null;
    },
    scene: "village",
    title: "A name for the child",
    body: (g, life, ctx) =>
      `The child is old enough to be named before the people. The clan has names that belong to it, waiting for someone to carry them; one of them is to be given to ${him(g.s.chars[ctx.c])}, and the grandmothers want to know what you think.`,
    choices: [
      {
        label: "Ask for an old name of the clan",
        tip: "Faith: the child carries an ancestor's name (+renown for the family).",
        apply: (g, life, ctx) => {
          fx(g, life, { xp: { faith: 8 }, renown: 1 });
          like(g, life, ctx, "Gave me an old name", 10, 20);
          say(
            g,
            life,
            "The old name was spoken at the fire, and the child answered to it with a sneeze, which was thought very promising.",
            "good",
          );
        },
      },
      {
        label: costs("Give a feast for the naming", 2),
        tip: "The whole village eats: +2 renown.",
        blocked: (g, life) => poor(life, 2),
        apply: (g, life) => {
          fx(g, life, { coins: -2, renown: 2, stress: -6 });
          say(
            g,
            life,
            "Corn soup and venison for all, and the child passed from arm to arm till it fell asleep.",
            "good",
          );
        },
      },
    ],
  },
  {
    key: "kin-grandmother",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      if (!native(g, life)) return null;
      const c = local(g, life, 53, (x) => x.female && ageOf(g.s, x) >= 60);
      return c ? { c: c.id } : null;
    },
    scene: "village",
    title: "The grandmothers' word",
    body: (g, life, ctx) =>
      `${charName(g.s.chars[ctx.c])}, eldest of the women of your clan, has sent for you. The clan's matters are the women's to decide, and she has decided that you have been neglecting yours.`,
    choices: [
      {
        label: "Listen, and do as she says",
        tip: "+15 opinion, +1 renown among the people.",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Heeds the grandmothers", 15, 5);
          fx(g, life, { renown: 1, stress: 2 });
          say(
            g,
            life,
            "You carried wood, mended a lodge, and sat with the old ones a whole evening. She nodded, once.",
            "good",
          );
        },
      },
      {
        label: "Explain yourself",
        tip: "Persuasion: she accepts it. Fail: she's not pleased (−10).",
        check: { skill: "persuasion", dc: 7 },
        apply: (g, life, ctx, pass) => {
          like(
            g,
            life,
            ctx,
            pass ? "Speaks well" : "Answers back",
            pass ? 6 : -10,
            4,
          );
          say(
            g,
            life,
            pass
              ? "She heard you out, and laughed, and let it go."
              : "She heard you out. That was all.",
          );
        },
      },
    ],
  },
];
