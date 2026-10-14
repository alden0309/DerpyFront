// DFSTORE (r21): the Derp Store's tabs, shared by Derp Land's Store and
// Inventory and DerpyFront's Derp Store page. A tab is a game, then one of
// its categories; the catalog (/derpy/api/store) lists both. Pure functions,
// so the tabs can be tested without a page.

export interface TabItem {
  name: string;
  game: string;
  category: string;
  price: number;
}

export interface TabSpec {
  game: string;
  label: string;
  categories: { id: string; label: string; blurb: string }[];
}

export interface StoreTabChoice {
  game: string;
  category: string;
}

/** The items under one tab, cheapest first (then in catalog order). */
export function itemsInTab<T extends TabItem>(
  items: readonly T[],
  tab: StoreTabChoice,
): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .filter(
      ({ item }) => item.game === tab.game && item.category === tab.category,
    )
    .sort((a, b) => a.item.price - b.item.price || a.i - b.i)
    .map(({ item }) => item);
}

/** Whether `owned` (derpy_owned rows) includes the item. */
export function ownsItem(owned: readonly string[], item: TabItem): boolean {
  return owned.includes(`pack:${item.name}`);
}

/** The items under one tab that `owned` includes. */
export function ownedInTab<T extends TabItem>(
  items: readonly T[],
  owned: readonly string[],
  tab: StoreTabChoice,
): T[] {
  return itemsInTab(items, tab).filter((i) => ownsItem(owned, i));
}

/** How many items each tab holds ("game/category" → count). */
export function tabCounts(
  items: readonly TabItem[],
  tabs: readonly TabSpec[],
  owned?: readonly string[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tabs) {
    for (const c of t.categories) {
      const tab = { game: t.game, category: c.id };
      counts.set(
        tabKey(tab),
        owned === undefined
          ? itemsInTab(items, tab).length
          : ownedInTab(items, owned, tab).length,
      );
    }
  }
  return counts;
}

export function tabKey(tab: StoreTabChoice): string {
  return `${tab.game}/${tab.category}`;
}

/** The first tab of the store (DerpyFront's skins). */
export function firstTab(tabs: readonly TabSpec[]): StoreTabChoice {
  const t = tabs[0];
  return {
    game: t?.game ?? "derpyfront",
    category: t?.categories[0]?.id ?? "skins",
  };
}

/**
 * The tab a link names ("#conquest/legends", "#effects" for a DerpyFront
 * category, "#conquest" for a game's first category), or the first tab.
 */
export function tabFromHash(
  hash: string,
  tabs: readonly TabSpec[],
): StoreTabChoice {
  const [a, b] = hash.replace(/^#/, "").split("/");
  const game = tabs.find((t) => t.game === a);
  if (game) {
    const cat = game.categories.find((c) => c.id === b) ?? game.categories[0];
    if (cat) return { game: game.game, category: cat.id };
  }
  for (const t of tabs) {
    const cat = t.categories.find((c) => c.id === a);
    if (cat) return { game: t.game, category: cat.id };
  }
  return firstTab(tabs);
}

/** The link fragment for a tab ("#derpyfront/effects"). */
export function tabHash(tab: StoreTabChoice): string {
  return `#${tabKey(tab)}`;
}
