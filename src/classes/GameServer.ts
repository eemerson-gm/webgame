import { WebSocketServer, WebSocket } from "ws";
import type { RawData } from "ws";
import { merge } from "lodash";
import { Server } from "http";
import { buildSurfaceStartByColumn } from "../world/terrainGen";
import { TILE_PX, WORLD_TILE_COLUMNS, WORLD_TILE_ROWS } from "../world/worldConfig";
import {
  buildTerrainTilesFromSurface,
  terrainTileKey,
} from "../world/terrainTiles";
import { createInitialEntitiesData } from "../simulation/entitySpawns";
import { stepEntities } from "../simulation/entitySimulation";
import type { TileCollisionWorld } from "../simulation/entityPhysics";
import { decodeMessage, encodeMessage, messageTypes } from "./GameProtocol";
import type {
  Data,
  EntitiesSnapshotPayload,
  EntityState,
  PlayerState,
  TerrainBlockBreakUpdate,
  TerrainBlockUpdate,
  TerrainTileKind,
  WorldTerrainPayload,
} from "./GameProtocol";

type MessageRouting = Record<string, "all" | "player" | "others">;

const playerStateMessageTypes: string[] = [
  messageTypes.createPlayer,
  messageTypes.updatePlayer,
];

const isPlayerStateMessage = (type: string) => {
  return playerStateMessageTypes.includes(type);
};

const entityTickMs = 1000 / 60;
const maxEntityTickMs = 100;

const isTerrainTileKind = (kind: unknown): kind is TerrainTileKind => {
  if (kind === "bedrock") {
    return true;
  }
  if (kind === "grass") {
    return true;
  }
  if (kind === "lamp") {
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

const blockBreakUpdateFromPayload = (payload: Data): TerrainBlockBreakUpdate | null => {
  const column = Number(payload.column);
  const row = Number(payload.row);
  const breakDurationMs = Number(payload.breakDurationMs);
  if (!Number.isInteger(column) || !Number.isInteger(row)) {
    return null;
  }
  if (typeof payload.isBreaking !== "boolean") {
    return null;
  }
  if (
    payload.breakDurationMs !== undefined &&
    (!Number.isFinite(breakDurationMs) || breakDurationMs <= 0)
  ) {
    return null;
  }
  return {
    column,
    row,
    isBreaking: payload.isBreaking,
    ...(payload.breakDurationMs === undefined ? {} : { breakDurationMs }),
  };
};

export class GameServer {
  private nextPlayerIndex = 0;
  private wss: WebSocketServer;
  private playerSockets: Record<string, WebSocket>;
  private playersData: Record<string, PlayerState>;
  private entitiesData: Record<string, EntityState>;
  private worldSurfaceStarts: number[];
  private worldTerrainTiles: Record<string, TerrainTileKind>;
  private lastEntityTickMs = Date.now();

  constructor(server: Server) {
    const worldSurfaceStarts = buildSurfaceStartByColumn({
      columns: WORLD_TILE_COLUMNS,
      rows: WORLD_TILE_ROWS,
    });
    this.wss = new WebSocketServer({ server, perMessageDeflate: true });
    this.playerSockets = {};
    this.playersData = {};
    this.entitiesData = createInitialEntitiesData(worldSurfaceStarts);
    this.worldSurfaceStarts = worldSurfaceStarts;
    this.worldTerrainTiles = buildTerrainTilesFromSurface(
      WORLD_TILE_COLUMNS,
      WORLD_TILE_ROWS,
      worldSurfaceStarts,
    );
    this.startEntityTick();
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
    this.playersData[playerId] = { isPaused: false };
    console.log(
      `[${playerId}]: Connected (${Object.keys(this.playerSockets).length} players)`,
    );
    this.sendToPlayer(playerId, messageTypes.connected, {
      id: playerId,
      playersData: this.playersData,
      entitiesData: this.entitiesData,
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
    data: RawData,
    messages: MessageRouting,
  ) {
    const json = data.toString();
    const message = decodeMessage(json);
    const { type, payload } = message;
    const wasPaused = this.playersData[playerId]?.isPaused === true;
    const isResuming = wasPaused && this.shouldResumePlayer(type, payload);
    const patch = this.playerStatePatch(type, payload, message.statePatch);
    const playerPatch = isResuming ? { ...patch, isPaused: false } : patch;
    this.playersData[playerId] = merge(this.playersData[playerId], playerPatch);
    if (!(type in messages)) {
      console.error("Unknown message type:", type);
      console.log(`[${playerId}]: ${json}`);
      return;
    }
    if (this.isPausedInteraction(playerId, type)) {
      console.log(`[${playerId}]: Paused interaction blocked`);
      return;
    }
    const outgoingPayload = isResuming ? { ...payload, isPaused: false } : payload;
    const payloadWithPlayerId = this.payloadForMessage(
      type,
      outgoingPayload,
      playerId,
    );
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

  private playerStatePatch(type: string, payload: Data, statePatch?: Data) {
    if (statePatch !== undefined) {
      return statePatch;
    }
    if (isPlayerStateMessage(type)) {
      return payload;
    }
    return {};
  }

  private shouldResumePlayer(type: string, payload: Data) {
    if (type !== messageTypes.updatePlayer) {
      return false;
    }
    return payload.isPaused !== true;
  }

  private isPausedInteraction(playerId: string, type: string) {
    if (this.playersData[playerId]?.isPaused !== true) {
      return false;
    }
    return type !== messageTypes.updatePlayer;
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

  private entitiesPayload(): EntitiesSnapshotPayload {
    return {
      entitiesData: this.entitiesData,
    };
  }

  private startEntityTick() {
    setInterval(() => this.updateEntities(), entityTickMs);
  }

  private updateEntities() {
    const dt = this.entityTickDeltaSeconds();
    this.entitiesData = stepEntities(this.entitiesData, {
      playersData: this.playersData,
      world: this.tileCollisionWorld(),
      dt,
    });
    if (Object.keys(this.playerSockets).length === 0) {
      return;
    }
    this.sendToAll(messageTypes.updateEntities, this.entitiesPayload());
  }

  private entityTickDeltaSeconds() {
    const now = Date.now();
    const elapsedMs = Math.min(
      Math.max(now - this.lastEntityTickMs, 0),
      maxEntityTickMs,
    );
    this.lastEntityTickMs = now;
    return elapsedMs / 1000;
  }

  private tileCollisionWorld(): TileCollisionWorld {
    return {
      tileWidth: TILE_PX,
      tileHeight: TILE_PX,
      columns: WORLD_TILE_COLUMNS,
      rows: WORLD_TILE_ROWS,
      isSolidTile: (column, row) => this.isSolidTile(column, row),
    };
  }

  private isSolidTile(column: number, row: number) {
    if (column < 0 || column >= WORLD_TILE_COLUMNS) {
      return true;
    }
    if (row >= WORLD_TILE_ROWS) {
      return true;
    }
    if (row < 0) {
      return false;
    }
    return !!this.worldTerrainTiles[terrainTileKey(column, row)];
  }

  private payloadForMessage(type: string, payload: Data, playerId: string) {
    if (type === messageTypes.updateBlock) {
      return this.applyWorldBlockUpdate(payload, playerId);
    }
    if (type === messageTypes.updateBlockBreak) {
      return this.blockBreakPayload(payload, playerId);
    }
    return { ...payload, id: playerId };
  }

  private blockBreakPayload(payload: Data, playerId: string) {
    const update = blockBreakUpdateFromPayload(payload);
    if (!update) {
      return null;
    }
    if (!isInsideWorld(update.column, update.row)) {
      return null;
    }
    return { ...update, id: playerId };
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
