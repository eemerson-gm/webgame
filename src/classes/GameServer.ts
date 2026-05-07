import { WebSocketServer, WebSocket } from "ws";
import type { RawData } from "ws";
import { merge } from "lodash";
import { Server } from "http";
import { buildSurfaceStartByColumn } from "../world/terrainGen";
import {
  TILE_PX,
  WORLD_TILE_COLUMNS,
  WORLD_TILE_ROWS,
  minerPowerupSpawnColumns,
} from "../world/worldConfig";
import {
  buildTerrainTilesFromSurface,
  terrainTileKey,
} from "../world/terrainTiles";
import { SpawnStructure } from "../world/SpawnStructure";
import {
  isBreakableTerrainTileKind,
  isTerrainTileKind,
  solidTerrainTileKeys,
} from "./TerrainTileKinds";
import {
  createInitialEntitiesData,
  createItemEntityState,
  createSlimeEntityState,
} from "../simulation/entitySpawns";
import {
  terrainBlockDropsForKind,
  type ResolvedTerrainBlockDrop,
} from "./TerrainBlockDrops";
import { decodeMessage, encodeMessage, messageTypes } from "./GameProtocol";
import type {
  Data,
  EntityCollectPayload,
  EntitiesSnapshotPayload,
  EntityCreatePayload,
  EntityState,
  EntityUpdatePayload,
  EntityDamageUpdate,
  ItemEntityState,
  JoinWorldPayload,
  PlayerDamageUpdate,
  PlayerPowerup,
  PlayerState,
  TerrainBlockBreakUpdate,
  TerrainBlockUpdate,
  TerrainTileKind,
  WorldSummary,
  WorldTerrainPayload,
} from "./GameProtocol";

type MessageRouting = Record<string, "all" | "player" | "others">;
type WorldRoom = {
  id: string;
  name: string;
  nextEntityIndex: number;
  playerSockets: Record<string, WebSocket>;
  playersData: Record<string, PlayerState>;
  entitiesData: Record<string, EntityState>;
  worldSurfaceStarts: number[];
  worldTerrainTiles: Record<string, TerrainTileKind>;
  protectedTerrainTiles: Set<string>;
  playerSpawn: { x: number; y: number };
};

const playerStateMessageTypes: string[] = [
  messageTypes.createPlayer,
  messageTypes.updatePlayer,
  messageTypes.updatePing,
];
const entityDamageKnockbackHorizontalSpeed = 1.5;
const entityDamageKnockbackVerticalSpeed = -1.6;
const entityDamageKnockbackDurationMs = 240;
const droppedItemPickupDelayMs = 100;
const droppedItemSize = 8;
const droppedItemSpawnHorizontalSpeed = 0.45;
const droppedItemSpawnVerticalSpeed = -1.2;
const droppedItemCollectionDistance = TILE_PX * 2;
const playerPowerups = ["none", "miner"] as const satisfies readonly PlayerPowerup[];
const worldNameAdjectives = [
  "Amber",
  "Bright",
  "Copper",
  "Mossy",
  "Quiet",
  "Ruby",
] as const;
const worldNameNouns = [
  "Grove",
  "Hill",
  "Meadow",
  "Peak",
  "Vale",
  "Woods",
] as const;

const isPlayerStateMessage = (type: string) => {
  return playerStateMessageTypes.includes(type);
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

const isServerPlayerPowerup = (value: unknown): value is PlayerPowerup =>
  playerPowerups.includes(value as PlayerPowerup);

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
    ...(isServerPlayerPowerup(payload.brokenWith)
      ? { brokenWith: payload.brokenWith }
      : {}),
    ...(typeof payload.dropItems === "boolean" ? { dropItems: payload.dropItems } : {}),
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
  private nextWorldIndex = 1;
  private wss: WebSocketServer;
  private lobbySockets: Record<string, WebSocket>;
  private socketWorldIds: Record<string, string>;
  private worlds: Record<string, WorldRoom>;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, perMessageDeflate: true });
    this.lobbySockets = {};
    this.socketWorldIds = {};
    this.worlds = {
      public: this.createWorldRoom("public", "Public World"),
    };
  }

  private createWorldRoom(id: string, name: string): WorldRoom {
    const worldSurfaceStarts = buildSurfaceStartByColumn({
      columns: WORLD_TILE_COLUMNS,
      rows: WORLD_TILE_ROWS,
    });
    const worldTerrainTiles = buildTerrainTilesFromSurface(
      WORLD_TILE_COLUMNS,
      WORLD_TILE_ROWS,
      worldSurfaceStarts,
    );
    const spawnStructure = new SpawnStructure(
      WORLD_TILE_COLUMNS,
      WORLD_TILE_ROWS,
      worldSurfaceStarts,
    );
    const protectedTerrainTiles = new Set(spawnStructure.tileKeys());
    const terrainTiles = spawnStructure.applyTo(worldTerrainTiles);

    minerPowerupSpawnColumns.forEach((column) => {
      const surfaceRow = worldSurfaceStarts[column];
      if (surfaceRow !== undefined) {
        const key = terrainTileKey(column, surfaceRow - 1);
        if (!protectedTerrainTiles.has(key)) {
          terrainTiles[key] = "mushroom";
        }
      }
    });

    return {
      id,
      name,
      nextEntityIndex: 1,
      playerSockets: {},
      playersData: {},
      entitiesData: createInitialEntitiesData(),
      worldSurfaceStarts,
      worldTerrainTiles: terrainTiles,
      protectedTerrainTiles,
      playerSpawn: spawnStructure.spawnPosition(TILE_PX),
    };
  }

  public listen(messages: MessageRouting) {
    console.log("[WS] Waiting for connections...");
    this.wss.on("connection", (socket) => {
      this.attachClient(socket, messages);
    });
  }

  public sendToPlayer(playerId: string, type: string, payload: Data) {
    const playerSocket = this.socketForPlayer(playerId);
    if (!playerSocket) {
      console.error("Socket not found:", playerId);
      return;
    }
    playerSocket.send(encodeMessage({ type, payload }));
  }

  public sendToOthers(fromPlayerId: string, type: string, payload: Data) {
    const room = this.worldRoomForPlayer(fromPlayerId);
    if (!room) {
      return;
    }
    this.sendToRoomOthers(room, fromPlayerId, type, payload);
  }

  public sendToAll(type: string, payload: Data) {
    Object.values(this.worlds).forEach((room) =>
      this.sendToRoomAll(room, type, payload),
    );
  }

  private sendToSocket(socket: WebSocket, type: string, payload: Data) {
    socket.send(encodeMessage({ type, payload }));
  }

  private sendToRoomPlayer(
    room: WorldRoom,
    playerId: string,
    type: string,
    payload: Data,
  ) {
    const playerSocket = room.playerSockets[playerId];
    if (!playerSocket) {
      console.error("Socket not found:", playerId);
      return;
    }
    this.sendToSocket(playerSocket, type, payload);
  }

  private sendToRoomOthers(
    room: WorldRoom,
    fromPlayerId: string,
    type: string,
    payload: Data,
  ) {
    Object.keys(room.playerSockets)
      .filter((otherPlayerId) => otherPlayerId !== fromPlayerId)
      .forEach((otherPlayerId) =>
        this.sendToRoomPlayer(room, otherPlayerId, type, payload),
      );
  }

  private sendToRoomAll(room: WorldRoom, type: string, payload: Data) {
    Object.keys(room.playerSockets).forEach((playerId) =>
      this.sendToRoomPlayer(room, playerId, type, payload),
    );
  }

  private attachClient(socket: WebSocket, messages: MessageRouting) {
    const playerId = (this.nextPlayerIndex++).toString();
    this.lobbySockets[playerId] = socket;
    console.log(
      `[${playerId}]: Lobby connected (${Object.keys(this.lobbySockets).length} clients)`,
    );
    this.sendWorldsUpdatedTo(socket);
    socket.on("message", (data) => this.handleSocketMessage(playerId, data, messages));
    socket.on("close", () => this.removeClient(playerId));
    socket.on("error", (error) => console.error(`${playerId}:`, error));
  }

  private socketForPlayer(playerId: string) {
    const room = this.worldRoomForPlayer(playerId);
    if (room) {
      return room.playerSockets[playerId];
    }
    return this.lobbySockets[playerId];
  }

  private worldRoomForPlayer(playerId: string) {
    const worldId = this.socketWorldIds[playerId];
    if (!worldId) {
      return null;
    }
    return this.worlds[worldId] ?? null;
  }

  private worldSummaries(): WorldSummary[] {
    return Object.values(this.worlds).map((room) => ({
      id: room.id,
      name: room.name,
      playerCount: Object.keys(room.playerSockets).length,
    }));
  }

  private sendWorldsUpdatedTo(socket: WebSocket) {
    this.sendToSocket(socket, messageTypes.worldsUpdated, {
      worlds: this.worldSummaries(),
    });
  }

  private broadcastWorldsUpdatedToLobby() {
    Object.values(this.lobbySockets).forEach((socket) => {
      this.sendWorldsUpdatedTo(socket);
    });
  }

  private generatedWorldName(index: number) {
    const adjective = worldNameAdjectives[index % worldNameAdjectives.length];
    const noun =
      worldNameNouns[
        Math.floor(index / worldNameAdjectives.length) % worldNameNouns.length
      ];
    return `${adjective} ${noun}`;
  }

  private createGeneratedWorldRoom() {
    const worldIndex = this.nextWorldIndex++;
    const room = this.createWorldRoom(
      `world${worldIndex}`,
      this.generatedWorldName(worldIndex),
    );
    this.worlds[room.id] = room;
    return room;
  }

  private handleLobbyMessage(playerId: string, type: string, payload: Data) {
    if (type === messageTypes.listWorlds) {
      const socket = this.socketForPlayer(playerId);
      if (socket) {
        this.sendWorldsUpdatedTo(socket);
      }
      return true;
    }
    if (type === messageTypes.createWorld) {
      const room = this.createGeneratedWorldRoom();
      this.joinWorld(playerId, room.id);
      return true;
    }
    if (type === messageTypes.joinWorld) {
      const { worldId } = payload as JoinWorldPayload;
      this.joinWorld(playerId, String(worldId ?? ""));
      return true;
    }
    if (type === messageTypes.leaveWorld) {
      this.leaveWorld(playerId);
      return true;
    }
    return false;
  }

  private joinWorld(playerId: string, worldId: string) {
    const socket = this.socketForPlayer(playerId);
    const room = this.worlds[worldId];
    if (!socket || !room) {
      return;
    }
    this.leaveWorld(playerId);
    delete this.lobbySockets[playerId];
    this.socketWorldIds[playerId] = room.id;
    room.playerSockets[playerId] = socket;
    room.playersData[playerId] = {
      isPaused: false,
      health: 6,
      x: room.playerSpawn.x,
      y: room.playerSpawn.y,
    };
    const didReassignEntities = this.assignBalancedEntityOwners(room);
    console.log(
      `[${playerId}]: Joined ${room.name} (${Object.keys(room.playerSockets).length} players)`,
    );
    this.sendToRoomPlayer(room, playerId, messageTypes.connected, {
      id: playerId,
      playersData: room.playersData,
      entitiesData: room.entitiesData,
      world: this.worldPayload(room),
    });
    if (didReassignEntities) {
      this.sendToRoomOthers(
        room,
        playerId,
        messageTypes.updateEntities,
        this.entitiesPayload(room),
      );
    }
    this.broadcastWorldsUpdatedToLobby();
  }

  private leaveWorld(playerId: string) {
    const room = this.worldRoomForPlayer(playerId);
    if (!room) {
      return;
    }
    const socket = room.playerSockets[playerId];
    delete room.playerSockets[playerId];
    delete room.playersData[playerId];
    delete this.socketWorldIds[playerId];
    if (socket) {
      this.lobbySockets[playerId] = socket;
    }
    const didReassignEntities = this.assignBalancedEntityOwners(room);
    this.sendToRoomOthers(room, playerId, messageTypes.disconnected, { id: playerId });
    if (didReassignEntities) {
      this.sendToRoomAll(room, messageTypes.updateEntities, this.entitiesPayload(room));
    }
    this.broadcastWorldsUpdatedToLobby();
  }

  private handleSocketMessage(
    playerId: string,
    data: RawData,
    messages: MessageRouting,
  ) {
    const json = data.toString();
    const message = decodeMessage(json);
    const { type, payload } = message;
    if (this.handleLobbyMessage(playerId, type, payload)) {
      console.log(`[${playerId}]: ${json}`);
      return;
    }
    const room = this.worldRoomForPlayer(playerId);
    if (!room) {
      console.error("World message before join:", type);
      console.log(`[${playerId}]: ${json}`);
      return;
    }
    const wasActive = this.isActivePlayer(room, playerId);
    const wasPaused = room.playersData[playerId]?.isPaused === true;
    const isResuming = wasPaused && this.shouldResumePlayer(type, payload);
    const patch = this.playerStatePatch(type, payload, message.statePatch);
    const playerPatch = isResuming ? { ...patch, isPaused: false } : patch;
    room.playersData[playerId] = merge(room.playersData[playerId], playerPatch);
    if (!(type in messages)) {
      console.error("Unknown message type:", type);
      console.log(`[${playerId}]: ${json}`);
      return;
    }
    this.reassignEntitiesIfPlayerActivityChanged(room, playerId, wasActive);
    if (this.isPausedInteraction(room, playerId, type)) {
      console.log(`[${playerId}]: Paused interaction blocked`);
      return;
    }
    if (this.isServerOnlyStatePatch(payload, message.statePatch)) {
      return;
    }
    const outgoingPayload = isResuming ? { ...payload, isPaused: false } : payload;
    const payloadWithPlayerId = this.payloadForMessage(
      room,
      type,
      outgoingPayload,
      playerId,
    );
    if (!payloadWithPlayerId) {
      console.error("Invalid message payload:", type);
      console.log(`[${playerId}]: ${json}`);
      return;
    }
    const outgoingType = this.outgoingMessageType(type);
    const target = messages[type];
    const send: Record<"all" | "player" | "others", () => void> = {
      all: () => this.sendToRoomAll(room, outgoingType, payloadWithPlayerId),
      player: () =>
        this.sendToRoomPlayer(room, playerId, outgoingType, payloadWithPlayerId),
      others: () =>
        this.sendToRoomOthers(room, playerId, outgoingType, payloadWithPlayerId),
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

  private isPausedInteraction(room: WorldRoom, playerId: string, type: string) {
    if (room.playersData[playerId]?.isPaused !== true) {
      return false;
    }
    return type !== messageTypes.updatePlayer;
  }

  private isServerOnlyStatePatch(payload: Data, statePatch?: Data) {
    if (statePatch === undefined) {
      return false;
    }
    return Object.keys(payload).length === 0;
  }

  private reassignEntitiesIfPlayerActivityChanged(
    room: WorldRoom,
    playerId: string,
    wasActive: boolean,
  ) {
    if (wasActive === this.isActivePlayer(room, playerId)) {
      return;
    }
    if (!this.assignBalancedEntityOwners(room)) {
      return;
    }
    this.sendToRoomAll(room, messageTypes.updateEntities, this.entitiesPayload(room));
  }

  private removeClient(playerId: string) {
    const room = this.worldRoomForPlayer(playerId);
    if (!room) {
      delete this.lobbySockets[playerId];
      this.broadcastWorldsUpdatedToLobby();
      console.log(
        `[${playerId}]: Lobby disconnected (${Object.keys(this.lobbySockets).length} clients)`,
      );
      return;
    }
    delete room.playerSockets[playerId];
    delete room.playersData[playerId];
    delete this.socketWorldIds[playerId];
    const didReassignEntities = this.assignBalancedEntityOwners(room);
    console.log(
      `[${playerId}]: Disconnected from ${room.name} (${Object.keys(room.playerSockets).length} players)`,
    );
    this.sendToRoomOthers(room, playerId, messageTypes.disconnected, { id: playerId });
    if (didReassignEntities) {
      this.sendToRoomAll(room, messageTypes.updateEntities, this.entitiesPayload(room));
    }
    this.broadcastWorldsUpdatedToLobby();
  }

  private worldPayload(room: WorldRoom): WorldTerrainPayload {
    return {
      columns: WORLD_TILE_COLUMNS,
      rows: WORLD_TILE_ROWS,
      playerSpawn: room.playerSpawn,
      surfaceStartByColumn: room.worldSurfaceStarts,
      solidTiles: solidTerrainTileKeys(room.worldTerrainTiles),
      protectedTiles: Array.from(room.protectedTerrainTiles),
      terrainTiles: room.worldTerrainTiles,
    };
  }

  private entitiesPayload(room: WorldRoom): EntitiesSnapshotPayload {
    return {
      entitiesData: room.entitiesData,
    };
  }

  private entityPayload(entity: EntityState): EntitiesSnapshotPayload {
    return {
      entitiesData: {
        [entity.id]: entity,
      },
      replaceExisting: false,
    };
  }

  private entitiesPayloadFor(entities: EntityState[]): EntitiesSnapshotPayload {
    return {
      entitiesData: Object.fromEntries(
        entities.map((entity) => [entity.id, entity]),
      ),
      replaceExisting: false,
    };
  }

  private activePlayerIds(room: WorldRoom) {
    return Object.keys(room.playerSockets).filter((playerId) =>
      this.isActivePlayer(room, playerId),
    );
  }

  private isActivePlayer(room: WorldRoom, playerId: string) {
    if (!room.playerSockets[playerId]) {
      return false;
    }
    return room.playersData[playerId]?.isPaused !== true;
  }

  private assignBalancedEntityOwners(room: WorldRoom) {
    const activePlayerIds = this.activePlayerIds(room);
    const nextEntitiesData = Object.fromEntries(
      Object.entries(room.entitiesData).map(([entityId, entity], index) => [
        entityId,
        {
          ...entity,
          ownerId:
            activePlayerIds.length === 0
              ? undefined
              : activePlayerIds[index % activePlayerIds.length],
        },
      ]),
    );
    const didChangeOwner = Object.values(nextEntitiesData).some(
      (entity) => room.entitiesData[entity.id]?.ownerId !== entity.ownerId,
    );
    room.entitiesData = nextEntitiesData;
    return didChangeOwner;
  }

  private applyEntityUpdate(room: WorldRoom, payload: Data, playerId: string) {
    const entity = (payload as EntityUpdatePayload).entity;
    if (!entity) {
      return null;
    }
    const storedEntity = room.entitiesData[entity.id];
    if (!storedEntity) {
      return null;
    }
    if (storedEntity.ownerId !== playerId) {
      return null;
    }
    if (storedEntity.type === "item") {
      return this.applyItemEntityUpdate(room, storedEntity, entity, playerId);
    }
    if (entity.type !== "slime") {
      return null;
    }
    const updatedEntity = {
      ...storedEntity,
      ...entity,
      id: storedEntity.id,
      type: storedEntity.type,
      ownerId: playerId,
      health: storedEntity.health,
    };
    room.entitiesData = {
      ...room.entitiesData,
      [storedEntity.id]: updatedEntity,
    };
    return this.entityPayload(updatedEntity);
  }

  private applyItemEntityUpdate(
    room: WorldRoom,
    storedEntity: ItemEntityState,
    entity: EntityState,
    playerId: string,
  ) {
    if (entity.type !== "item") {
      return null;
    }
    const updatedEntity = {
      ...storedEntity,
      ...entity,
      id: storedEntity.id,
      type: storedEntity.type,
      ownerId: playerId,
      item: storedEntity.item,
      count: storedEntity.count,
      collectibleAtMs: storedEntity.collectibleAtMs,
    };
    room.entitiesData = {
      ...room.entitiesData,
      [storedEntity.id]: updatedEntity,
    };
    return this.entityPayload(updatedEntity);
  }

  private applyEntityCreate(room: WorldRoom, payload: Data, playerId: string) {
    const entity = this.entityCreatePayloadFrom(room, payload, playerId);
    if (!entity) {
      return null;
    }
    room.entitiesData = {
      ...room.entitiesData,
      [entity.id]: entity,
    };
    return this.entityPayload(entity);
  }

  private entityCreatePayloadFrom(room: WorldRoom, payload: Data, playerId: string) {
    const createPayload = payload as EntityCreatePayload;
    const x = Number(createPayload.x);
    const y = Number(createPayload.y);
    if (createPayload.type !== "slime") {
      return null;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    const entityId = `slime${room.nextEntityIndex++}`;
    return createSlimeEntityState(
      entityId,
      x,
      y,
      this.isActivePlayer(room, playerId) ? playerId : undefined,
    );
  }

  private applyEntityDamage(room: WorldRoom, payload: Data, playerId: string) {
    const update = this.entityDamageUpdateFromPayload(payload);
    if (!update) {
      return null;
    }
    const storedEntity = room.entitiesData[update.entityId];
    if (!storedEntity) {
      return null;
    }
    if (storedEntity.type !== "slime") {
      return null;
    }
    const damage = update.damage ?? 1;
    const nextHealth = Math.max(storedEntity.health - damage, 0);
    const player = room.playersData[playerId];
    const playerX = Number(player?.x);
    const direction =
      Number.isFinite(playerX) && storedEntity.x + TILE_PX / 2 < playerX + TILE_PX / 2
        ? -1
        : 1;
    const updatedEntity = {
      ...storedEntity,
      health: nextHealth,
      horizontalSpeed: entityDamageKnockbackHorizontalSpeed * direction,
      verticalSpeed: entityDamageKnockbackVerticalSpeed,
      knockbackMs: entityDamageKnockbackDurationMs,
    };
    if (nextHealth <= 0) {
      delete room.entitiesData[storedEntity.id];
      return this.entityPayload(updatedEntity);
    }
    room.entitiesData = {
      ...room.entitiesData,
      [storedEntity.id]: updatedEntity,
    };
    return this.entityPayload(updatedEntity);
  }

  private entityDamageUpdateFromPayload(payload: Data): EntityDamageUpdate | null {
    const entityId = String(payload.entityId ?? "");
    const damage = Number(payload.damage ?? 1);
    if (!entityId) {
      return null;
    }
    if (!Number.isFinite(damage) || damage <= 0) {
      return null;
    }
    return {
      entityId,
      damage,
    };
  }

  private applyEntityCollection(room: WorldRoom, payload: Data, playerId: string) {
    const entityId = String((payload as EntityCollectPayload).entityId ?? "");
    if (!entityId) {
      return null;
    }
    const entity = room.entitiesData[entityId];
    if (!entity) {
      return null;
    }
    if (entity.type !== "item") {
      return null;
    }
    if (!this.isActivePlayer(room, playerId)) {
      return null;
    }
    if (Date.now() < entity.collectibleAtMs) {
      return null;
    }
    if (!this.isPlayerCloseEnoughToItem(room, playerId, entity)) {
      return null;
    }
    delete room.entitiesData[entity.id];
    return {
      entitiesData: {},
      removedEntityIds: [entity.id],
      replaceExisting: false,
      collectedItem: {
        collectorId: playerId,
        item: entity.item,
        count: entity.count,
      },
    } satisfies EntitiesSnapshotPayload;
  }

  private isPlayerCloseEnoughToItem(
    room: WorldRoom,
    playerId: string,
    entity: ItemEntityState,
  ) {
    const player = room.playersData[playerId];
    const playerX = Number(player?.x);
    const playerY = Number(player?.y);
    if (!Number.isFinite(playerX) || !Number.isFinite(playerY)) {
      return false;
    }
    return (
      Math.hypot(
        playerX + TILE_PX / 2 - (entity.x + droppedItemSize / 2),
        playerY + TILE_PX / 2 - (entity.y + droppedItemSize / 2),
      ) <= droppedItemCollectionDistance
    );
  }

  private playerDamagePayload(payload: Data, playerId: string) {
    const update = payload as PlayerDamageUpdate;
    const targetId = String(update.targetId ?? "");
    const damage = Number(update.damage ?? 1);
    if (!targetId) {
      return null;
    }
    const room = this.worldRoomForPlayer(playerId);
    if (!room?.playerSockets[targetId]) {
      return null;
    }
    if (!Number.isFinite(damage) || damage <= 0) {
      return null;
    }
    return {
      id: playerId,
      targetId,
      damage,
    };
  }

  private outgoingMessageType(type: string) {
    if (type === messageTypes.ping) {
      return messageTypes.pong;
    }
    if (type === messageTypes.createEntity) {
      return messageTypes.updateEntities;
    }
    if (type === messageTypes.updateEntity) {
      return messageTypes.updateEntities;
    }
    if (type === messageTypes.damageEntity) {
      return messageTypes.updateEntities;
    }
    if (type === messageTypes.collectEntity) {
      return messageTypes.updateEntities;
    }
    return type;
  }

  private payloadForMessage(
    room: WorldRoom,
    type: string,
    payload: Data,
    playerId: string,
  ) {
    if (type === messageTypes.createEntity) {
      return this.applyEntityCreate(room, payload, playerId);
    }
    if (type === messageTypes.updateEntity) {
      return this.applyEntityUpdate(room, payload, playerId);
    }
    if (type === messageTypes.damageEntity) {
      return this.applyEntityDamage(room, payload, playerId);
    }
    if (type === messageTypes.collectEntity) {
      return this.applyEntityCollection(room, payload, playerId);
    }
    if (type === messageTypes.damagePlayer) {
      return this.playerDamagePayload(payload, playerId);
    }
    if (type === messageTypes.updateBlock) {
      return this.applyWorldBlockUpdate(room, payload, playerId);
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

  private applyWorldBlockUpdate(room: WorldRoom, payload: Data, playerId: string) {
    const update = blockUpdateFromPayload(payload);
    if (!update) {
      return null;
    }
    if (!isInsideWorld(update.column, update.row)) {
      return null;
    }
    const key = terrainTileKey(update.column, update.row);
    const existingKind = room.worldTerrainTiles[key];
    if (existingKind && !isBreakableTerrainTileKind(existingKind)) {
      return null;
    }
    if (!update.solid) {
      if (!existingKind) {
        return null;
      }
      delete room.worldTerrainTiles[key];
      const drops = this.createBlockDropEntities(room, update, existingKind, playerId);
      return {
        ...update,
        id: playerId,
        ...this.entitiesPayloadFor(drops),
      };
    }
    const kind = update.kind ?? "dirt";
    if (room.protectedTerrainTiles.has(key)) {
      return null;
    }
    if (!isBreakableTerrainTileKind(kind)) {
      return null;
    }
    room.worldTerrainTiles[key] = kind;
    return { ...update, id: playerId, kind };
  }

  private createBlockDropEntities(
    room: WorldRoom,
    update: TerrainBlockUpdate,
    existingKind: TerrainTileKind,
    playerId: string,
  ) {
    if (room.playersData[playerId]?.isFlying) {
      return [];
    }
    if (update.dropItems === false) {
      return [];
    }
    const brokenWith = update.brokenWith ?? "none";
    const drops: ResolvedTerrainBlockDrop[] = terrainBlockDropsForKind(
      existingKind,
      brokenWith,
    );
    return drops
      .map((drop) => {
        const entity = createItemEntityState(
          `item${room.nextEntityIndex++}`,
          update.column * TILE_PX + Math.floor((TILE_PX - droppedItemSize) / 2),
          update.row * TILE_PX + Math.floor((TILE_PX - droppedItemSize) / 2),
          drop.item,
          drop.count,
          Date.now() + droppedItemPickupDelayMs,
          this.isActivePlayer(room, playerId) ? playerId : undefined,
          this.itemDropHorizontalSpeed(),
          droppedItemSpawnVerticalSpeed,
        );
        room.entitiesData = {
          ...room.entitiesData,
          [entity.id]: entity,
        };
        return entity;
      });
  }

  private itemDropHorizontalSpeed() {
    return (Math.random() * 2 - 1) * droppedItemSpawnHorizontalSpeed;
  }
}
