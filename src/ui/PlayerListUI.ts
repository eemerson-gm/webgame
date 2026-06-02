import type { PlayerState } from "../classes/GameWire";

export class PlayerListUI {
  private readonly playerPingById: Record<string, number | undefined> = {};

  private readonly playerListElement = () =>
    document.getElementById("player-list");

  public rememberPings(playersData: Record<string, PlayerState>): void {
    Object.entries(playersData).forEach(([playerId, state]) => {
      this.playerPingById[playerId] = state.pingMs;
    });
  }

  public setPing(playerId: string, pingMs: number): void {
    this.playerPingById[playerId] = pingMs;
  }

  public removePlayer(playerId: string): void {
    delete this.playerPingById[playerId];
  }

  public render(localClientId: string, remotePlayerIds: string[]): void {
    const list = this.playerListElement();
    if (!list) {
      return;
    }
    const playerIds = this.playerListIds(localClientId, remotePlayerIds);
    list.replaceChildren(
      ...playerIds.map((playerId) =>
        this.createPlayerListRow(playerId, localClientId),
      ),
    );
  }

  private playerListIds(
    localClientId: string,
    remotePlayerIds: string[],
  ): string[] {
    return [
      localClientId,
      ...remotePlayerIds,
      ...Object.keys(this.playerPingById),
    ]
      .filter((playerId): playerId is string => playerId.length > 0)
      .filter(
        (playerId, index, playerIds) => playerIds.indexOf(playerId) === index,
      )
      .sort((a, b) => Number(a) - Number(b));
  }

  private playerDisplayName(playerId: string, localClientId: string): string {
    if (playerId === localClientId) {
      return `Player ${playerId} (you)`;
    }
    return `Player ${playerId}`;
  }

  private playerPingText(playerId: string): string {
    const pingMs = this.playerPingById[playerId];
    if (pingMs === undefined) {
      return "-- ms";
    }
    return `${Math.round(pingMs)} ms`;
  }

  private createPlayerListRow(
    playerId: string,
    localClientId: string,
  ): HTMLDivElement {
    const row = document.createElement("div");
    const name = document.createElement("span");
    const ping = document.createElement("span");
    row.className = "player-list__row";
    ping.className = "player-list__ping";
    name.textContent = this.playerDisplayName(playerId, localClientId);
    ping.textContent = this.playerPingText(playerId);
    row.replaceChildren(name, ping);
    return row;
  }
}
