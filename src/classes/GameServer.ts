import { WebSocketServer, WebSocket } from "ws";
import { Data } from "./GameClient";
import { merge } from "lodash";
import { Server } from "http";
import { buildSurfaceStartByColumn } from "../world/terrainGen";
import {
  WORLD_TILE_COLUMNS,
  WORLD_TILE_ROWS,
} from "../world/worldConfig";

type MessageRouting = Record<string, "player" | "others">;

type SocketMessage = {
  _t: string;
  _p: Data;
  _d?: Data;
};

export class GameServer {
  private nextPlayerIndex = 0;
  private wss: WebSocketServer;
  private playerSockets: Record<string, WebSocket>;
  private playersData: Record<string, Data>;
  private worldSurfaceStarts: number[];

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server });
    this.playerSockets = {};
    this.playersData = {};
    this.worldSurfaceStarts = buildSurfaceStartByColumn({
      columns: WORLD_TILE_COLUMNS,
      rows: WORLD_TILE_ROWS,
    });
  }

  public listen(messages: MessageRouting) {
    console.log("[WS] Waiting for connections...");
    this.wss.on("connection", (socket) => {
      this.attachPlayer(socket, messages);
    });
  }

  public sendToPlayer(playerId: string, type: string, payload: Data) {
    const playerSocket = this.playerSockets[playerId];
    if (!playerSocket) {
      console.error("Socket not found:", playerId);
      return;
    }
    playerSocket.send(JSON.stringify({ _t: type, _p: payload }));
  }

  public sendToOthers(fromPlayerId: string, type: string, payload: Data) {
    Object.keys(this.playerSockets)
      .filter((otherPlayerId) => otherPlayerId !== fromPlayerId)
      .forEach((otherPlayerId) =>
        this.sendToPlayer(otherPlayerId, type, payload)
      );
  }

  private attachPlayer(socket: WebSocket, messages: MessageRouting) {
    const playerId = (this.nextPlayerIndex++).toString();
    this.playerSockets[playerId] = socket;
    this.playersData[playerId] = {};
    console.log(
      `[${playerId}]: Connected (${Object.keys(this.playerSockets).length} players)`
    );
    this.sendToPlayer(playerId, "_connected", {
      id: playerId,
      playersData: this.playersData,
      world: {
        columns: WORLD_TILE_COLUMNS,
        rows: WORLD_TILE_ROWS,
        surfaceStartByColumn: this.worldSurfaceStarts,
      },
    });
    socket.on("message", (data) =>
      this.handleSocketMessage(playerId, data, messages)
    );
    socket.on("close", () => this.removePlayer(playerId));
    socket.on("error", (error) => console.error(`${playerId}:`, error));
  }

  private handleSocketMessage(
    playerId: string,
    data: WebSocket.RawData,
    messages: MessageRouting
  ) {
    const json = data.toString();
    const message = JSON.parse(json) as SocketMessage;
    const type = message._t;
    const payload = message._p;
    const patch = message._d ?? {};
    this.playersData[playerId] = merge(this.playersData[playerId], patch);
    if (!(type in messages)) {
      console.error("Unknown message type:", type);
      console.log(`[${playerId}]: ${json}`);
      return;
    }
    const payloadWithPlayerId = { ...payload, id: playerId };
    const target = messages[type];
    const send: Record<"player" | "others", () => void> = {
      player: () => this.sendToPlayer(playerId, type, payloadWithPlayerId),
      others: () =>
        this.sendToOthers(playerId, type, payloadWithPlayerId),
    };
    send[target]();
    console.log(`[${playerId}]: ${json}`);
  }

  private removePlayer(playerId: string) {
    delete this.playerSockets[playerId];
    delete this.playersData[playerId];
    console.log(
      `[${playerId}]: Disconnected (${Object.keys(this.playerSockets).length} players)`
    );
    this.sendToOthers(playerId, "_disconnected", { id: playerId });
  }
}
