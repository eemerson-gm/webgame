import { WebSocketServer, WebSocket } from "ws";
import type { RawData } from "ws";
import { merge } from "lodash";
import { Server } from "http";
import { generateWorld } from "../world/worldGeneration";
import { loadWorldDefinition } from "../world/worldDefinition";
import { solidTerrainTileKeys } from "./TerrainTileKinds";
import {
  GameWire,
  messageTypes,
  relayRules,
  type ClientToServer,
  type EntityState,
  type PlayerState,
  type RelayRule,
  type ServerToClient,
  type TerrainTileKind,
  type WorldSummary,
  type WorldTerrain,
} from "./GameWire";

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

export class GameServer {
  private nextPlayerIndex = 0;
  private nextWorldIndex = 1;
  private wss: WebSocketServer;
  private lobbySockets: Record<string, WebSocket>;
  private socketWorldIds: Record<string, string>;
  private worlds: Record<string, WorldRoom>;
  private readonly wire = new GameWire();

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
    const seed = this.randomWorldSeed();
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

  public listen(): void {
    console.log("[WS] Waiting for connections...");
    this.wss.on("connection", (socket) => {
      this.attachClient(socket);
    });
  }

  public sendToPlayer(playerId: string, message: ServerToClient): void {
    const playerSocket = this.socketForPlayer(playerId);
    if (!playerSocket) {
      console.error("Socket not found:", playerId);
      return;
    }
    playerSocket.send(this.wire.encodeServer(message));
  }

  public sendToOthers(fromPlayerId: string, message: ServerToClient): void {
    const room = this.worldRoomForPlayer(fromPlayerId);
    if (!room) {
      return;
    }
    this.sendToRoomOthers(room, fromPlayerId, message);
  }

  public sendToAll(message: ServerToClient): void {
    Object.values(this.worlds).forEach((room) => this.sendToRoomAll(room, message));
  }

  private randomWorldSeed(): number {
    const seed = Math.floor(Math.random() * 0x7fffffff);
    if (seed === 0) {
      return 1;
    }
    return seed;
  }

  private sendToSocket(socket: WebSocket, message: ServerToClient): void {
    socket.send(this.wire.encodeServer(message));
  }

  private sendToRoomPlayer(
    room: WorldRoom,
    playerId: string,
    message: ServerToClient,
  ): void {
    const playerSocket = room.playerSockets[playerId];
    if (!playerSocket) {
      console.error("Socket not found:", playerId);
      return;
    }
    this.sendToSocket(playerSocket, message);
  }

  private sendToRoomOthers(
    room: WorldRoom,
    fromPlayerId: string,
    message: ServerToClient,
  ): void {
    Object.keys(room.playerSockets)
      .filter((otherPlayerId) => otherPlayerId !== fromPlayerId)
      .forEach((otherPlayerId) =>
        this.sendToRoomPlayer(room, otherPlayerId, message),
      );
  }

  private sendToRoomAll(room: WorldRoom, message: ServerToClient): void {
    Object.keys(room.playerSockets).forEach((playerId) =>
      this.sendToRoomPlayer(room, playerId, message),
    );
  }

  private attachClient(socket: WebSocket): void {
    const playerId = (this.nextPlayerIndex++).toString();
    this.lobbySockets[playerId] = socket;
    console.log(
      `[${playerId}]: Lobby connected (${Object.keys(this.lobbySockets).length} clients)`,
    );
    this.sendWorldsUpdatedTo(socket);
    socket.on("message", (data) => this.handleSocketMessage(playerId, data));
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

  private sendWorldsUpdatedTo(socket: WebSocket): void {
    this.sendToSocket(socket, {
      type: messageTypes.worldsUpdated,
      payload: { worlds: this.worldSummaries() },
    });
  }

  private broadcastWorldsUpdatedToLobby(): void {
    Object.values(this.lobbySockets).forEach((socket) => {
      this.sendWorldsUpdatedTo(socket);
    });
  }

  private generatedWorldName(index: number): string {
    const adjective = worldNameAdjectives[index % worldNameAdjectives.length];
    const noun =
      worldNameNouns[
        Math.floor(index / worldNameAdjectives.length) % worldNameNouns.length
      ];
    return `${adjective} ${noun}`;
  }

  private createGeneratedWorldRoom(): WorldRoom {
    const worldIndex = this.nextWorldIndex++;
    const room = this.createWorldRoom(
      `world${worldIndex}`,
      this.generatedWorldName(worldIndex),
    );
    this.worlds[room.id] = room;
    return room;
  }

  private handleLobbyMessage(playerId: string, message: ClientToServer): boolean {
    if (message.type === messageTypes.listWorlds) {
      const socket = this.socketForPlayer(playerId);
      if (socket) {
        this.sendWorldsUpdatedTo(socket);
      }
      return true;
    }
    if (message.type === messageTypes.createWorld) {
      const room = this.createGeneratedWorldRoom();
      this.joinWorld(playerId, room.id);
      return true;
    }
    if (message.type === messageTypes.joinWorld) {
      this.joinWorld(playerId, message.payload.worldId);
      return true;
    }
    if (message.type === messageTypes.leaveWorld) {
      this.leaveWorld(playerId);
      return true;
    }
    return false;
  }

  private joinWorld(playerId: string, worldId: string): void {
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
    this.sendToRoomPlayer(room, playerId, {
      type: messageTypes.connected,
      payload: {
        id: playerId,
        playersData: room.playersData,
        entitiesData: room.entitiesData,
        world: this.worldPayload(room),
      },
    });
    this.broadcastWorldsUpdatedToLobby();
  }

  private leaveWorld(playerId: string): void {
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
    this.sendToRoomOthers(room, playerId, {
      type: messageTypes.disconnected,
      payload: { id: playerId },
    });
    this.broadcastWorldsUpdatedToLobby();
  }

  private handleSocketMessage(playerId: string, data: RawData): void {
    const json = data.toString();
    const message = this.wire.parseClientToServer(json);
    if (!message) {
      return;
    }
    if (this.handleLobbyMessage(playerId, message)) {
      console.log(`[${playerId}]: ${json}`);
      return;
    }
    const room = this.worldRoomForPlayer(playerId);
    if (!room) {
      console.error("World message before join:", message.type);
      console.log(`[${playerId}]: ${json}`);
      return;
    }
    const rule = relayRules[message.type];
    if (!rule) {
      console.error("Unknown message type:", message.type);
      console.log(`[${playerId}]: ${json}`);
      return;
    }
    const wasPaused = room.playersData[playerId]?.isPaused === true;
    const isResuming = wasPaused && this.shouldResumePlayer(message);
    if (rule.mergesState) {
      const patch = this.wire.playerStatePatch(message);
      const playerPatch = isResuming ? { ...patch, isPaused: false } : patch;
      room.playersData[playerId] = merge(room.playersData[playerId], playerPatch);
    }
    if (this.isPausedInteraction(room, playerId, message.type)) {
      console.log(`[${playerId}]: Paused interaction blocked`);
      return;
    }
    if (this.isServerOnlyStatePatch(message)) {
      return;
    }
    const outbound = this.buildRelayOutbound(
      message,
      playerId,
      room,
      rule,
      isResuming,
    );
    if (!outbound) {
      return;
    }
    this.deliverRelay(room, playerId, rule, outbound);
    console.log(`[${playerId}]: ${json}`);
  }

  private shouldResumePlayer(message: ClientToServer): boolean {
    if (message.type !== messageTypes.updatePlayer) {
      return false;
    }
    return message.payload.isPaused !== true;
  }

  private isPausedInteraction(
    room: WorldRoom,
    playerId: string,
    type: ClientToServer["type"],
  ): boolean {
    if (room.playersData[playerId]?.isPaused !== true) {
      return false;
    }
    return type !== messageTypes.updatePlayer;
  }

  private isServerOnlyStatePatch(message: ClientToServer): boolean {
    if (message.type !== messageTypes.updatePlayer) {
      return false;
    }
    if (message.statePatch === undefined) {
      return false;
    }
    return Object.keys(message.payload).length === 0;
  }

  private buildRelayOutbound(
    message: ClientToServer,
    playerId: string,
    room: WorldRoom,
    rule: RelayRule,
    isResuming: boolean,
  ): ServerToClient | null {
    if (rule.drop) {
      return null;
    }
    const outboundType = rule.outboundType ?? message.type;
    if (rule.validate === "playerDamage") {
      if (message.type !== messageTypes.damagePlayer) {
        return null;
      }
      const payload = this.wire.validatePlayerDamage(
        message.payload,
        playerId,
        (targetId) => Boolean(room.playerSockets[targetId]),
      );
      if (!payload) {
        return null;
      }
      return {
        type: messageTypes.damagePlayer,
        payload,
      };
    }
    let payload = message.payload;
    if (message.type === messageTypes.updatePlayer && isResuming) {
      payload = { ...message.payload, isPaused: false };
    }
    if (rule.attachPlayerId) {
      return {
        type: outboundType,
        payload: { ...payload, id: playerId },
      } as ServerToClient;
    }
    return {
      type: outboundType,
      payload,
    } as ServerToClient;
  }

  private deliverRelay(
    room: WorldRoom,
    playerId: string,
    rule: RelayRule,
    message: ServerToClient,
  ): void {
    if (rule.audience === "all") {
      this.sendToRoomAll(room, message);
      return;
    }
    if (rule.audience === "player") {
      this.sendToRoomPlayer(room, playerId, message);
      return;
    }
    this.sendToRoomOthers(room, playerId, message);
  }

  private removeClient(playerId: string): void {
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
    this.sendToRoomOthers(room, playerId, {
      type: messageTypes.disconnected,
      payload: { id: playerId },
    });
    this.broadcastWorldsUpdatedToLobby();
  }

  private worldPayload(room: WorldRoom): WorldTerrain {
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
}
