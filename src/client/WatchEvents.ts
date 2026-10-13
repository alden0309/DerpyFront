// Derp Land (SITE r19): how many are watching this game (its spectators, from
// the lobby or since), as the server tells everyone in it. Players see
// "2 watching" in the sidebar.

import { GameEvent } from "@openfront/shared/EventBus";

export class WatchersChangedEvent implements GameEvent {
  constructor(public readonly count: number) {}
}
