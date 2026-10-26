import { GameConfigPatch } from "@openfront/engine-api/Schemas";
import { GameEvent } from "@openfront/shared/EventBus";

// Sent from the lobby screens, which load before the game client: here, not
// in Transport, so emitting them doesn't pull the connection into the
// homepage's bundle.

export class SendKickPlayerIntentEvent implements GameEvent {
  constructor(public readonly target: string) {}
}

export class SendUpdateGameConfigIntentEvent implements GameEvent {
  constructor(public readonly config: GameConfigPatch) {}
}

export class SendToggleGameStartTimer implements GameEvent {
  constructor() {}
}

// Switch between playing and watching from the lobby screen.
export class SendSpectateEvent implements GameEvent {
  constructor(public readonly spectator: boolean) {}
}

// DFX (r26): "Random nations": the host deals every player a seat at once
// (nation key -> clientID).
export class SendScenarioDealIntentEvent implements GameEvent {
  constructor(public readonly seats: Record<string, string>) {}
}

// SCEN (r25): take a nation in a scenario lobby (null: give up your seat).
// With a target, the host moves that player (or frees their seat).
export class SendScenarioSeatIntentEvent implements GameEvent {
  constructor(
    public readonly nation: string | null,
    public readonly target?: string,
  ) {}
}
