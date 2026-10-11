// Applies the server's deltas to a player's copy of the game state.

import { applySocietyDelta } from "./SocietyCore"; // SOCIETY (r11)
import { GameDelta, GameState } from "./Types";

const MAX_BATTLES_KEPT = 40;

export function applyDelta(s: GameState, d: GameDelta): void {
  s.day = d.day;
  if (d.prov) {
    for (const [i, p] of Object.entries(d.prov)) s.provinces[Number(i)] = p;
  }
  if (d.armies) {
    for (const [key, a] of Object.entries(d.armies)) {
      const id = Number(key);
      const at = s.armies.findIndex((x) => x.id === id);
      if (a === null) {
        if (at >= 0) s.armies.splice(at, 1);
      } else if (at >= 0) {
        s.armies[at] = a;
      } else {
        s.armies.push(a);
      }
    }
  }
  if (d.nations) {
    for (const [i, n] of Object.entries(d.nations)) s.nations[Number(i)] = n;
  }
  if (d.chars) {
    for (const [i, c] of Object.entries(d.chars)) s.chars[Number(i)] = c;
  }
  if (d.wars) s.wars = d.wars;
  if (d.truces) s.truces = d.truces;
  if (d.treaties) s.treaties = d.treaties;
  if (d.offers) s.offers = d.offers;
  if (d.deals) s.deals = d.deals;
  if (d.europe) s.europe = d.europe;
  if (d.battles) {
    s.battles.push(...d.battles);
    if (s.battles.length > MAX_BATTLES_KEPT) {
      s.battles.splice(0, s.battles.length - MAX_BATTLES_KEPT);
    }
  }
  if (d.lives) {
    for (const [seat, life] of Object.entries(d.lives)) {
      const at = s.lives.findIndex((l) => l.seat === seat);
      if (at >= 0) s.lives[at] = life;
      else s.lives.push(life);
    }
  }
  if (d.locals) {
    for (const [p, ids] of Object.entries(d.locals)) s.locals[Number(p)] = ids;
  }
  if (d.movements) s.movements = d.movements;
  if (d.travellers) s.travellers = d.travellers;
  if (d.rumours) s.rumours = d.rumours;
  if (d.society) applySocietyDelta(s, d.society); // SOCIETY (r11)
  if (d.polities) {
    for (const [n, pol] of Object.entries(d.polities))
      s.polities[Number(n)] = pol;
  }
  // WORLD r11: changed fields only, markets and leads.
  if (d.provPatch)
    for (const [i, p] of Object.entries(d.provPatch))
      Object.assign(s.provinces[Number(i)], p);
  if (d.nationPatch)
    for (const [i, n] of Object.entries(d.nationPatch))
      Object.assign(s.nations[Number(i)], n);
  if (d.lifePatch)
    for (const [seat, l] of Object.entries(d.lifePatch)) {
      const life = s.lives.find((x) => x.seat === seat);
      if (life) Object.assign(life, l);
    }
  if (d.markets) {
    s.markets ??= {};
    for (const [p, m] of Object.entries(d.markets)) {
      if (m) s.markets[Number(p)] = m;
      else delete s.markets[Number(p)];
    }
  }
  if (d.leads) s.leads = d.leads;
  if (d.over) {
    s.over = true;
    s.winner = d.over.winner;
  }
}
