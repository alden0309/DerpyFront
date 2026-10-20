import type { AiType } from "@openfront/engine-lib/game/AiPersonalityTypes";
import type { EventBus } from "@openfront/shared/EventBus";
import { customElement } from "lit/decorators.js";
import { type StatsRow, StatsTable } from "../../components/StatsTable";
import { AI_CHOICE_ICON } from "../../derpy/AiPersonalityIcons";
import { withSideMark } from "../../scenario/ScenarioClient"; // SCEN (r25)
import { GoToPlayerEvent } from "../../TransformHandler";
import type { GameView } from "../../view";
import { type ColumnDef, columnValues } from "./lib/StatsColumns";

/**
 * AIP (r23): a nation dealt a personality is listed with its icon before its
 * name ("🛡️ Spain"), the same icon its info panel and tooltip show.
 */
export function withPersonalityIcon(name: string, type: AiType | null): string {
  return type === null ? name : `${AI_CHOICE_ICON[type]} ${name}`;
}

@customElement("player-stats")
export class PlayerStats extends StatsTable {
  public eventBus: EventBus | null = null;

  protected readonly tableKind = "player";

  protected buildRows(
    game: GameView,
    columns: readonly ColumnDef[],
  ): StatsRow[] {
    const myPlayer = game.myPlayer();

    return game
      .playerViews()
      .filter((player) => player.isAlive())
      .map((player) => ({
        key: player.id(),
        // SCEN (r25): a scenario's sides are marked
        name: withSideMark(
          withPersonalityIcon(player.name(), player.aiPersonality()),
          player,
        ),
        clanTag: player.clanTag(),
        values: columnValues(player, game, columns),
        emphasized:
          myPlayer !== null &&
          (player === myPlayer || player.isOnSameTeam(myPlayer)),
        pinned: player === myPlayer,
        onClick: () => {
          if (this.eventBus !== null) {
            this.eventBus.emit(new GoToPlayerEvent(player));
          }
        },
      }));
  }
}
