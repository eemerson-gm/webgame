import { WebSocketServer, WebSocket } from "ws";
import type { RawData } from "ws";
import { merge } from "lodash";
import { Server } from "http";
import { generateWorld } from "../world/worldGeneration";
import { loadWorldDefinition } from "../world/worldDefinition";
import { solidTerrainTileKeys } from "./TerrainTileKinds";
import { decodeMessage, encodeMessage, messageTypes } from "./GameProtocol";
import type {
  Data,
  EntityState,
  JoinWorldPayload,
  PlayerDamageUpdate,
  PlayerState,
  TerrainTileKind,
  WorldSummary,
  WorldTerrainPayload,
} from "./GameProtocol";

type MessageRouting = Record<string, "all" | "player" | "others">;
type WorldRoom = {
  id: string;
  name: string;
  seed: number;
  columns: number;
  rows: number;
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

const randomWorldSeed = () => {
  const seed = Math.floor(Math.random() * 0x7fffffff);
  return seed === 0 ? 1 : seed;
};

const isPlayerStateMessage = (type: string) => {
  return playerStateMessageTypes.includes(type);
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
      public: this.createWorldRoom("public"),
    };
  }

  private createWorldRoom(id: string, name?: string): WorldRoom {
    const definition = loadWorldDefinition("public");
    const seed = randomWorldSeed();
    const generatedWorld = generateWorld(definition, seed);

    return {
      id,
      name: name ?? definition.name,
      seed,
      columns: generatedWorld.columns,
      rows: generatedWorld.rows,
      nextEntityIndex: 1,
      playerSockets: {},
      playersData: {},
      entitiesData: generatedWorld.entitiesData,
      worldSurfaceStarts: generatedWorld.surfaceStartByColumn,
      worldTerrainTiles: generatedWorld.terrainTiles,
      protectedTerrainTiles: generatedWorld.protectedTerrainTiles,
      playerSpawn: generatedWorld.playerSpawn,
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
    console.log(
      `[${playerId}]: Joined ${room.name} (${Object.keys(room.playerSockets).length} players)`,
    );
    this.sendToRoomPlayer(room, playerId, messageTypes.connected, {
      id: playerId,
      playersData: room.playersData,
      entitiesData: room.entitiesData,
      world: this.worldPayload(room),
    });
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
    this.sendToRoomOthers(room, playerId, messageTypes.disconnected, { id: playerId });
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
    if (payloadWithPlayerId === null) {
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
    console.log(
      `[${playerId}]: Disconnected from ${room.name} (${Object.keys(room.playerSockets).length} players)`,
    );
    this.sendToRoomOthers(room, playerId, messageTypes.disconnected, { id: playerId });
    this.broadcastWorldsUpdatedToLobby();
  }

  private worldPayload(room: WorldRoom): WorldTerrainPayload {
    return {
      columns: room.columns,
      rows: room.rows,
      playerSpawn: room.playerSpawn,
      surfaceStartByColumn: room.worldSurfaceStarts,
      solidTiles: solidTerrainTileKeys(room.worldTerrainTiles),
      protectedTiles: Array.from(room.protectedTerrainTiles),
      terrainTiles: room.worldTerrainTiles,
    };
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
    return type;
  }

  private payloadForMessage(
    room: WorldRoom,
    type: string,
    payload: Data,
    playerId: string,
  ): Data | null {
    if (type === messageTypes.createEntity) {
      return null;
    }
    if (type === messageTypes.updateEntity) {
      return null;
    }
    if (type === messageTypes.damageEntity) {
      return null;
    }
    if (type === messageTypes.damagePlayer) {
      return this.playerDamagePayload(payload, playerId);
    }
    return { ...payload, id: playerId };
  }
}
