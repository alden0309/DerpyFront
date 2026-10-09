import { ClientID } from "@openfront/engine-api/Schemas";
import { ChatChannel } from "@openfront/shared/Chat";
import { GameEvent } from "@openfront/shared/EventBus";
import { ServerChatMessage } from "@openfront/shared/WireSchemas";

/** The chat panel asks the transport to send a line. */
export class SendChatEvent implements GameEvent {
  constructor(
    public readonly channel: ChatChannel,
    public readonly text: string,
    /** Recipients for "team" and "allies"; unused for "all". */
    public readonly to: ClientID[] = [],
  ) {}
}

/** A chat line arrived from the server (or the singleplayer local server). */
export class ChatReceivedEvent implements GameEvent {
  constructor(public readonly message: ServerChatMessage) {}
}

/** The open-chat keybind was pressed. */
export class OpenChatEvent implements GameEvent {}
