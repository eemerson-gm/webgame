import { WebSocketServer, WebSocket } from "ws";
import { merge } from "lodash";
import { Server } from "http";
import { buildSurfaceStartByColumn } from "../world/terrainGen";
import { WORLD_TILE_COLUMNS, WORLD_TILE_ROWS } from "../world/worldConfig";
import {
  buildTerrainTilesFromSurface,
  terrainTileKey,
} from "../world/terrainTiles";
import { decodeMessage, encodeMessage, messageTypes } from "./GameProtocol";
import type {
  Data,
  TerrainBlockUpdate,
  TerrainTileKind,
  WorldTerrainPayload,
} from "./GameProtocol";

type MessageRouting = Record<string, "all" | "player" | "others">;

const isTerrainTileKind = (kind: unknown): kind is TerrainTileKind => {
  if (kind === "bedrock") {
    return true;
  }
  if (kind === "grass") {
    return true;
  }
  if (kind === "stone") {
    return true;
  }
  return kind === "dirt";
};

const isInsideWorld = (column: number, row: number) => {
  if (column < 0 || column >= WORLD_TILE_COLUMNS) {
    return false;
  }
  if (row < 0 || row >= WORLD_TILE_ROWS) {
    return false;
  }
  return true;
};

const blockUpdateFromPayload = (payload: Data): TerrainBlockUpdate | null => {
  const column = Number(payload.column);
  const row = Number(payload.row);
  if (!Number.isInteger(column) || !Number.isInteger(row)) {
    return null;
  }
  if (typeof payload.solid !== "boolean") {
    return null;
  }
  if (payload.kind !== undefined && !isTerrainTileKind(payload.kind)) {
    return null;
  }
  return {
    column,
    row,
    solid: payload.solid,
    kind: payload.kind,
  };
};

export class GameServer {
  private nextPlayerIndex = 0;
  private wss: WebSocketServer;
  private playerSockets: Record<string, WebSocket>;
  private playersData: Record<string, Data>;
  private worldSurfaceStarts: number[];
  private worldTerrainTiles: Record<string, TerrainTileKind>;

  constructor(server: Server) {
    const worldSurfaceStarts = buildSurfaceStartByColumn({
      columns: WORLD_TILE_COLUMNS,
      rows: WORLD_TILE_ROWS,
    });
    this.wss = new WebSocketServer({ server });
    this.playerSockets = {};
    this.playersData = {};
    this.worldSurfaceStarts = worldSurfaceStarts;
    this.worldTerrainTiles = buildTerrainTilesFromSurface(
      WORLD_TILE_COLUMNS,
      WORLD_TILE_ROWS,
      worldSurfaceStarts,
    );
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
    playerSocket.send(encodeMessage({ type, payload }));
  }

  public sendToOthers(fromPlayerId: string, type: string, payload: Data) {
    Object.keys(this.playerSockets)
      .filter((otherPlayerId) => otherPlayerId !== fromPlayerId)
      .forEach((otherPlayerId) =>
        this.sendToPlayer(otherPlayerId, type, payload),
      );
  }

  public sendToAll(type: string, payload: Data) {
    Object.keys(this.playerSockets).forEach((playerId) =>
      this.sendToPlayer(playerId, type, payload),
    );
  }

  private attachPlayer(socket: WebSocket, messages: MessageRouting) {
    const playerId = (this.nextPlayerIndex++).toString();
    this.playerSockets[playerId] = socket;
    this.playersData[playerId] = {};
    console.log(
      `[${playerId}]: Connected (${Object.keys(this.playerSockets).length} players)`,
    );
    this.sendToPlayer(playerId, messageTypes.connected, {
      id: playerId,
      playersData: this.playersData,
      world: this.worldPayload(),
    });
    socket.on("message", (data) =>
      this.handleSocketMessage(playerId, data, messages),
    );
    socket.on("close", () => this.removePlayer(playerId));
    socket.on("error", (error) => console.error(`${playerId}:`, error));
  }

  private handleSocketMessage(
    playerId: string,
    data: WebSocket.RawData,
    messages: MessageRouting,
  ) {
    const json = data.toString();
    const message = decodeMessage(json);
    const { type, payload } = message;
    const patch = message.statePatch ?? {};
    this.playersData[playerId] = merge(this.playersData[playerId], patch);
    if (!(type in messages)) {
      console.error("Unknown message type:", type);
      console.log(`[${playerId}]: ${json}`);
      return;
    }
    const payloadWithPlayerId = this.payloadForMessage(type, payload, playerId);
    if (!payloadWithPlayerId) {
      console.error("Invalid message payload:", type);
      console.log(`[${playerId}]: ${json}`);
      return;
    }
    const target = messages[type];
    const send: Record<"all" | "player" | "others", () => void> = {
      all: () => this.sendToAll(type, payloadWithPlayerId),
      player: () => this.sendToPlayer(playerId, type, payloadWithPlayerId),
      others: () => this.sendToOthers(playerId, type, payloadWithPlayerId),
    };
    send[target]();
    console.log(`[${playerId}]: ${json}`);
  }

  private removePlayer(playerId: string) {
    delete this.playerSockets[playerId];
    delete this.playersData[playerId];
    console.log(
      `[${playerId}]: Disconnected (${Object.keys(this.playerSockets).length} players)`,
    );
    this.sendToOthers(playerId, messageTypes.disconnected, { id: playerId });
  }

  private worldPayload(): WorldTerrainPayload {
    return {
      columns: WORLD_TILE_COLUMNS,
      rows: WORLD_TILE_ROWS,
      surfaceStartByColumn: this.worldSurfaceStarts,
      solidTiles: Object.keys(this.worldTerrainTiles),
      terrainTiles: this.worldTerrainTiles,
    };
  }

  private payloadForMessage(type: string, payload: Data, playerId: string) {
    if (type === messageTypes.updateBlock) {
      return this.applyWorldBlockUpdate(payload, playerId);
    }
    return { ...payload, id: playerId };
  }

  private applyWorldBlockUpdate(payload: Data, playerId: string) {
    const update = blockUpdateFromPayload(payload);
    if (!update) {
      return null;
    }
    if (!isInsideWorld(update.column, update.row)) {
      return null;
    }
    const key = terrainTileKey(update.column, update.row);
    if (this.worldTerrainTiles[key] === "bedrock") {
      return null;
    }
    if (!update.solid) {
      if (!this.worldTerrainTiles[key]) {
        return null;
      }
      delete this.worldTerrainTiles[key];
      return { ...update, id: playerId };
    }
    const kind = update.kind ?? "dirt";
    this.worldTerrainTiles[key] = kind;
    return { ...update, id: playerId, kind };
  }
}
