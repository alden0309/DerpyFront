// Who made the portraits, art, sounds and music in Derpy Conquest, and
// under what licence. Shown in the game's menu and on the lobby page. CC-BY
// works need their author named; the rest are public domain or CC0 but
// credited anyway. The portraits are listed in PortraitCredits.ts.

import { html, TemplateResult } from "lit";
import { PORTRAIT_CREDITS } from "./PortraitCredits";

export interface Credit {
  what: string;
  title: string;
  author: string;
  license: string;
  source: string;
}

export const CREDITS: Credit[] = [
  {
    what: "Picture",
    title: "Galleon",
    author: "papapishu",
    license: "CC0",
    source: "https://openclipart.org/detail/22696/galleon",
  },
  {
    what: "Picture",
    title: "Galleon ship silhouette",
    author: "GDJ",
    license: "CC0",
    source: "https://openclipart.org/detail/287955/galleon-ship-silhouette",
  },
  {
    what: "Picture",
    title: "Canoe silhouette",
    author: "johnny_automatic",
    license: "CC0",
    source: "https://openclipart.org/detail/377/canoe-silhouette",
  },
  {
    what: "Picture",
    title: "Musketman",
    author: "Technopeasant",
    license: "CC0",
    source: "https://openclipart.org/detail/342427/musketman",
  },
  {
    what: "Picture",
    title: "Musketman aiming",
    author: "Technopeasant",
    license: "CC0",
    source: "https://openclipart.org/detail/342428/musketman-aiming",
  },
  {
    what: "Picture",
    title: "Musketeer surveying",
    author: "Technopeasant",
    license: "CC0",
    source: "https://openclipart.org/detail/342536/musketeer-surveying",
  },
  {
    what: "Picture",
    title: "Horseman",
    author: "matzekatze",
    license: "CC0",
    source: "https://openclipart.org/detail/174948/horseman",
  },
  {
    what: "Picture",
    title: "Medieval cannon",
    author: "Helm42",
    license: "CC0",
    source: "https://openclipart.org/detail/169260/medieval-cannon",
  },
  {
    what: "Picture",
    title:
      "John White - An Indian 'werowance', or chief, painted for a great solemn gathering, 1906,0509.1.12",
    author: "John White (watercolour, c.1585-1593)",
    license: "Public Domain",
    source:
      "https://commons.wikimedia.org/wiki/File:John_White_-_An_Indian_'werowance',_or_chief,_painted_for_a_great_solemn_gathering,_1906,0509.1.12.jpg",
  },
  {
    what: "Picture",
    title: "John White - The town of Pomeiooc, 1906,0509.1.8",
    author: "John White (watercolour, c.1585-1593)",
    license: "Public Domain",
    source:
      "https://commons.wikimedia.org/wiki/File:John_White_-_The_town_of_Pomeiooc,_1906,0509.1.8.jpg",
  },
  // ===== r9 gameplay (Agent G): the paintings behind scenes, cropped and toned =====
  {
    what: "Picture",
    title: "Tavern Scene with a Smoker Holding a Crock (c.1650): the tavern",
    author: "David Teniers the Younger",
    license: "Public domain",
    source:
      "https://commons.wikimedia.org/wiki/File:David_Teniers_the_Younger_-_Tavern_scene_with_a_smoker_holding_a_crock.jpg",
  },
  {
    what: "Picture",
    title: "Interior of a Church (1668): the church",
    author: "Emanuel de Witte",
    license: "Public domain",
    source:
      "https://commons.wikimedia.org/wiki/File:Emanuel_de_Witte_-_Interior_of_a_Church_-_Google_Art_Project.jpg",
  },
  {
    what: "Picture",
    title: "The Herb Market of Amsterdam (c.1660): the market",
    author: "Gabriel Metsu",
    license: "Public domain",
    source:
      "https://commons.wikimedia.org/wiki/File:Le_March%C3%A9_aux_herbes_d%27Amsterdam_-_Gabriel_Metsu_-_Mus%C3%A9e_du_Louvre_Peintures_INV_1460.jpg",
  },
  {
    what: "Picture",
    title: "The Port of Marseille (1754): the docks",
    author: "Claude-Joseph Vernet",
    license: "Public domain",
    source: "https://commons.wikimedia.org/wiki/File:Vernet-marseille-1754.jpg",
  },
  {
    what: "Picture",
    title: "Ships in Distress off a Rocky Coast (1667): at sea",
    author: "Ludolf Backhuysen",
    license: "CC0",
    source:
      "https://commons.wikimedia.org/wiki/File:Ludolf_Backhuysen,_Ships_in_Distress_off_a_Rocky_Coast,_1667,_NGA_65898.jpg",
  },
  {
    what: "Picture",
    title: "Guardroom (1642): the fort",
    author: "David Teniers the Younger",
    license: "Public domain",
    source:
      "https://commons.wikimedia.org/wiki/File:David_Teniers_(II)_-_Guardroom_-_WGA22087.jpg",
  },
  {
    what: "Picture",
    title: "The Wanstead Assembly (1728-31): the governor's house",
    author: "William Hogarth",
    license: "Public domain",
    source:
      "https://commons.wikimedia.org/wiki/File:Wanstead_Assembly_at_Wanstead_House_by_Hogarth.jpg",
  },
  {
    what: "Picture",
    title: "The House of Commons, 1793-94: the assembly",
    author: "Karl Anton Hickel",
    license: "Public domain",
    source:
      "https://commons.wikimedia.org/wiki/File:The_House_of_Commons_1793-94_by_Karl_Anton_Hickel.jpg",
  },
  {
    what: "Picture",
    title: "Penn's Treaty with the Indians (1771-72): the council fire",
    author: "Benjamin West",
    license: "Public domain",
    source: "https://commons.wikimedia.org/wiki/File:Benjamin_West_003.jpg",
  },
  {
    what: "Picture",
    title:
      "Encampment among the Islands of Lake Huron (c.1845-50), an Ojibwa camp on Georgian Bay: the village",
    author: "Paul Kane (photograph of the painting, Royal Ontario Museum)",
    license: "Public domain",
    source:
      "https://commons.wikimedia.org/wiki/File:Paul_Kane-RiverScene-ROM.jpg",
  },
  {
    what: "Picture",
    title: "Wheat Fields (c.1670): the fields",
    author: "Jacob van Ruisdael",
    license: "CC0",
    source:
      "https://commons.wikimedia.org/wiki/File:Wheat_Fields_MET_DP145911.jpg",
  },
  {
    what: "Picture",
    title: "The Great Forest (1655-60): the woods",
    author: "Jacob van Ruisdael",
    license: "Public domain",
    source:
      "https://commons.wikimedia.org/wiki/File:Jacob_van_Ruisdael_-_The_Great_Forest_-_Google_Art_Project.jpg",
  },
  {
    what: "Picture",
    title: "The Avenue at Middelharnis (1689): the road",
    author: "Meindert Hobbema",
    license: "Public domain",
    source: "https://commons.wikimedia.org/wiki/File:Meindert_Hobbema_001.jpg",
  },
  {
    what: "Picture",
    title: "A Mother's Duty (c.1660): home",
    author: "Pieter de Hooch",
    license: "Public domain",
    source:
      "https://commons.wikimedia.org/wiki/File:Pieter_de_Hooch_-_Binnenkamer_met_een_moeder_die_het_haar_van_haar_kind_reinigt,_bekend_als_%27Moedertaak%27_-_Google_Art_Project.jpg",
  },
  {
    what: "Picture",
    title: "An Iron Forge (1772): the workshops",
    author: "Joseph Wright of Derby",
    license: "Public domain",
    source:
      "https://commons.wikimedia.org/wiki/File:Joseph_Wright_-_An_Iron_Forge_-_Google_Art_Project.jpg",
  },
  {
    what: "Picture",
    title: "Imprimerie en lettres, from the Encyclopédie: the printing house",
    author: "Louis-Jacques Goussier",
    license: "CC0",
    source:
      "https://commons.wikimedia.org/wiki/File:Planche_de_l%E2%80%99Encyclop%C3%A9die_de_Diderot_et_d%E2%80%99Alembert._Pl._1._Imprimerie_en_Lettres,_L%E2%80%99Op%C3%A9ration_de_la_casse,_G.33153.jpg",
  },
  {
    what: "Picture",
    title: "The Apothecary (c.1752): the apothecary",
    author: "Pietro Longhi",
    license: "Public domain",
    source: "https://commons.wikimedia.org/wiki/File:Pietro_Longhi_012.jpg",
  },
  {
    what: "Picture",
    title: "The Death of General Wolfe (1770): battle",
    author: "Benjamin West",
    license: "Public domain",
    source: "https://commons.wikimedia.org/wiki/File:Benjamin_West_005.jpg",
  },
  {
    what: "Picture",
    title: "The Bloody Massacre (1770): a rising",
    author: "Paul Revere",
    license: "Public domain",
    source:
      "https://commons.wikimedia.org/wiki/File:Paul_Revere,_Jr._-_The_Bloody_Massacre_-_Google_Art_Project.jpg",
  },
  {
    what: "Picture",
    title: "Man Writing a Letter (1665): letters",
    author: "Gabriel Metsu",
    license: "Public domain",
    source:
      "https://commons.wikimedia.org/wiki/File:Man_Writing_a_Letter_by_Gabri%C3%ABl_Metsu.jpg",
  },
  // ===== end r9 gameplay (Agent G) =====
  // ===== LIFE (r11): the den, the gaol, and the road's weather =====
  {
    what: "Picture",
    title:
      "Industry and Idleness, plate 9: The Idle 'Prentice taken in a Night Cellar (1747): the den",
    author: "William Hogarth",
    license: "Public domain",
    source:
      "https://commons.wikimedia.org/wiki/File:William_Hogarth,_The_Idle_%27Prentice_betray%27d_by_his_Whore,_%26_taken_in_a_Night_Cellar_with_his_Accomplice,_1747,_NGA_30398.jpg",
  },
  {
    what: "Picture",
    title: "A Rake's Progress, plate 7: The Prison Scene (1735): the gaol",
    author: "William Hogarth",
    license: "Public domain",
    source:
      "https://commons.wikimedia.org/wiki/File:William_Hogarth_-_A_Rake%27s_Progress,_Plate_7,_The_Prison_Scene_-_Google_Art_Project.jpg",
  },
  {
    what: "Picture",
    title: "A Shipwreck in Stormy Seas (c.1773): storms at sea",
    author: "Claude-Joseph Vernet",
    license: "Public domain",
    source:
      "https://commons.wikimedia.org/wiki/File:Claude-Joseph_Vernet_-_A_Shipwreck_in_Stormy_Seas_(Temp%C3%AAte)_-_c_1773_-_National_Gallery_UK.jpg",
  },
  {
    what: "Picture",
    title: "A Forest Marsh with Travelers on a Bank (c.1660): swamps",
    author: "Jacob van Ruisdael",
    license: "Public domain",
    source:
      "https://commons.wikimedia.org/wiki/File:Jacob_van_Ruisdael,_A_Forest_Marsh_with_Travelers_on_a_Bank_(The_Travelers),_NGA_10401.jpg",
  },
  {
    what: "Picture",
    title: "River Landscape with Ferry (1649): fords and ferries",
    author: "Salomon van Ruysdael",
    license: "Public domain",
    source:
      "https://commons.wikimedia.org/wiki/File:Salomon_van_Ruysdael_-_River_Landscape_with_Ferry_-_Google_Art_Project.jpg",
  },
  {
    what: "Picture",
    title: "The Hunters in the Snow (1565): snow in the mountains",
    author: "Pieter Bruegel the Elder",
    license: "Public domain",
    source:
      "https://commons.wikimedia.org/wiki/File:Pieter_Bruegel_the_Elder_-_Hunters_in_the_Snow_(Winter)_-_Google_Art_Project.jpg",
  },
  // ===== end LIFE (r11) =====
  {
    what: "Picture",
    title: "RPG map symbols: fort 2 (sepia map style)",
    author: "Nicu Buculei (nicubunu)",
    license: "CC0",
    source: "https://openclipart.org/detail/11451/rpg-map-symbols-fort-2",
  },
  {
    what: "Picture",
    title: "RPG map symbols: village 2 (sepia)",
    author: "Nicu Buculei (nicubunu)",
    license: "CC0",
    source: "https://openclipart.org/detail/11544/rpg-map-symbols-village-2",
  },
  {
    what: "Picture",
    title: "RPG map symbols: city 2 (sepia)",
    author: "Nicu Buculei (nicubunu)",
    license: "CC0",
    source: "https://openclipart.org/detail/11439/rpg-map-symbols-city-2",
  },
  {
    what: "Picture",
    title: "RPG map symbols: warehouse/docks (sepia)",
    author: "Nicu Buculei (nicubunu)",
    license: "CC0",
    source: "https://openclipart.org/detail/11511",
  },
  {
    what: "Texture",
    title: "Paper006 (ambientCG paper material, Color map)",
    author: "ambientCG (Lennart Demes)",
    license: "CC0",
    source: "https://ambientcg.com/view?id=Paper006",
  },
  {
    what: "Texture",
    title: "Engraved sea wave hatching (seamless overlay, ink on transparent)",
    author: "Generated for Derpy Conquest",
    license: "CC0",
    source: "generated by script (no external source)",
  },
  {
    what: "Texture",
    title: "Hachured molehill hills (seamless overlay)",
    author: "Generated for Derpy Conquest",
    license: "CC0",
    source: "generated by script (no external source)",
  },
  {
    what: "Texture",
    title: "Hachured sugar-loaf mountains (seamless overlay)",
    author: "Generated for Derpy Conquest",
    license: "CC0",
    source: "generated by script (no external source)",
  },
  {
    what: "Texture",
    title:
      "Forest pictogram pattern built from game-icons 'pine-tree' and 'oak'",
    author: "Lorc (game-icons.net)",
    license: "CC BY 3.0",
    source:
      "https://game-icons.net/1x1/lorc/pine-tree.html ; https://game-icons.net/1x1/lorc/oak.html",
  },
  {
    what: "Texture",
    title:
      "Marsh pictogram pattern built from game-icons 'reed' and 'high-grass'",
    author: "Delapouite (game-icons.net)",
    license: "CC BY 3.0",
    source:
      "https://game-icons.net/1x1/delapouite/reed.html ; https://game-icons.net/1x1/delapouite/high-grass.html",
  },
  {
    what: "Sound",
    title: "Cannon fire",
    author: "Thimras (OpenGameArt)",
    license: "CC0",
    source: "https://opengameart.org/content/cannon-fire",
  },
  {
    what: "Sound",
    title: "Musket Fire (Minute Man National Historical Park)",
    author: "U.S. National Park Service (NPS Natural Sounds)",
    license: "Public domain",
    source: "https://www.nps.gov/subjects/sound/sounds-musket.htm",
  },
  {
    what: "Sound",
    title: "Battle Sounds (Cedar Creek reenactment)",
    author: "U.S. National Park Service (NPS Natural Sounds)",
    license: "Public domain",
    source: "https://www.nps.gov/subjects/sound/sounds-battle.htm",
  },
  {
    what: "Sound",
    title: "Drum Feature: Generations (excerpt)",
    author: "The United States Army Old Guard Fife and Drum Corps",
    license: "CC0",
    source:
      "https://commons.wikimedia.org/wiki/File:The_United_States_Army_Old_Guard_Fife_and_Drum_Corps_-_16_-_Drum_Feature_Generations_from_the_Simple_Gifts_Show.ogg",
  },
  {
    what: "Sound",
    title:
      "WWS Signalbell (Funke & Huster signal bell, LWL-Industriemuseum Zeche Zollern)",
    author: "Work With Sounds / Konrad Gutkowski",
    license: "CC BY 4.0",
    source: "https://commons.wikimedia.org/wiki/File:WWS_Signalbell.ogg",
  },
  {
    what: "Sound",
    title: "Pencil Sounds (pencil_write)",
    author: "AntumDeluge (Jordan Irwin)",
    license: "CC0",
    source: "https://opengameart.org/content/pencil-sounds",
  },
  {
    what: "Sound",
    title: "Impact Sounds",
    author: "Kenney (www.kenney.nl)",
    license: "CC0",
    source: "https://kenney.nl/assets/impact-sounds",
  },
  {
    what: "Sound",
    title: "Pirate Pack Vol 1",
    author: "JC Sounds",
    license: "CC BY 4.0",
    source: "https://opengameart.org/content/jc-sounds-pirate-pack-vol-1",
  },
  {
    what: "Sound",
    title: "RPG Audio",
    author: "Kenney (www.kenney.nl)",
    license: "CC0",
    source: "https://kenney.nl/assets/rpg-audio",
  },
  {
    what: "Sound",
    title: "Monteverdi: Toccata from L'Orfeo (1607), opening",
    author: "The United States Army Old Guard Fife and Drum Corps",
    license: "CC0",
    source:
      "https://commons.wikimedia.org/wiki/File:The_United_States_Army_Old_Guard_Fife_and_Drum_Corps_-_20_-_Monteverdis_Toccata_from_LOrfeo.ogg",
  },
  {
    what: "Sound",
    title: "ERAFNAF Fanfare (opening)",
    author: "The United States Army Old Guard Fife and Drum Corps",
    license: "CC0",
    source:
      "https://commons.wikimedia.org/wiki/File:The_United_States_Army_Old_Guard_Fife_and_Drum_Corps_-_01_-_ERAFNAF_Fanfare.ogg",
  },
  {
    what: "Sound",
    title: "Classic fanfare lick",
    author: "fvcalderan",
    license: "CC0",
    source: "https://opengameart.org/content/classic-fanfare-lick",
  },
  {
    what: "Music",
    title: "Suonatore di Liuto",
    author: "Kevin MacLeod (incompetech.com)",
    license: "CC BY 4.0",
    source:
      "https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1400023",
  },
  {
    what: "Music",
    title: "Teller of the Tales",
    author: "Kevin MacLeod (incompetech.com)",
    license: "CC BY 4.0",
    source:
      "https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1400020",
  },
  {
    what: "Music",
    title: "Village Consort",
    author: "Kevin MacLeod (incompetech.com)",
    license: "CC BY 4.0",
    source:
      "https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1700007",
  },
  {
    what: "Music",
    title: "Sinfonia Number 5",
    author: "Kevin MacLeod (incompetech.com)",
    license: "CC BY 4.0",
    source:
      "https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100673",
  },
  {
    what: "Music",
    title: "Monteverdi: Toccata from L'Orfeo (1607)",
    author: "The United States Army Old Guard Fife and Drum Corps",
    license: "CC0",
    source:
      "https://commons.wikimedia.org/wiki/File:The_United_States_Army_Old_Guard_Fife_and_Drum_Corps_-_20_-_Monteverdis_Toccata_from_LOrfeo.ogg",
  },
  {
    what: "Music",
    title: "Bugle Feature: Pezel Twist (from Warlike Musick)",
    author: "The United States Army Old Guard Fife and Drum Corps",
    license: "CC0",
    source:
      "https://commons.wikimedia.org/wiki/File:The_United_States_Army_Old_Guard_Fife_and_Drum_Corps_-_08_-_Bugle_Feature_Pezel_Twist_from_Warlike_Musick.ogg",
  },
  {
    what: "Music",
    title: "Achaidh Cheide",
    author: "Kevin MacLeod (incompetech.com)",
    license: "CC BY 4.0",
    source:
      "https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100340",
  },
  {
    what: "Music",
    title: "Fife and Drum",
    author: "Kevin MacLeod (incompetech.com)",
    license: "CC BY 4.0",
    source:
      "https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1600025",
  },
  // The gallery's paintings (r11).
  ...PORTRAIT_CREDITS.map(
    (c): Credit => ({
      what: "Portrait",
      title: c.title,
      author: c.author,
      license: c.license,
      source: c.source,
    }),
  ),
];

const GROUPS: [Credit["what"], string][] = [
  ["Portrait", "Portraits"],
  ["Music", "Music"],
  ["Sound", "Sounds"],
  ["Picture", "Pictures"],
  ["Texture", "Textures"],
];

/** The credits, grouped, with links to where each came from. */
export function creditsList(): TemplateResult {
  return html`<div class="cq-credits">
    ${GROUPS.filter(([what]) => CREDITS.some((c) => c.what === what)).map(
      ([what, title]) =>
        html`<section>
          <h3 class="cq-h3">${title}</h3>
          <ul>
            ${CREDITS.filter((c) => c.what === what).map(
              (c) =>
                html`<li>
                  <a href=${c.source} target="_blank" rel="noopener"
                    >${c.title}</a
                  >
                  ${c.author.startsWith("Generated")
                    ? "(made for Derpy Conquest)"
                    : `by ${c.author}`}
                  <span class="cq-muted small">(${c.license})</span>
                </li>`,
            )}
          </ul>
        </section>`,
    )}
  </div>`;
}
