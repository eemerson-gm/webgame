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
  type WorldSnapshotPayload,
  type WorldSummary,
  type WorldTerrain,
} from "./GameWire";
import { NetworkDiagnostics } from "./NetworkDiagnostics";
import { WorldRoomSimulator } from "../game/sim/WorldRoomSimulator";
import { physicsFixedStepMs } from "../world/physicsConfig";

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
  simulator: WorldRoomSimulator;
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
  private readonly networkDiagnostics = new NetworkDiagnostics();
  private simulationIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, perMessageDeflate: true });
    this.lobbySockets = {};
    this.socketWorldIds = {};
    this.worlds = {
      public: this.createWorldRoom("public"),
    };
    this.startSimulationLoop();
  }

  private createWorldRoom(id: string, name?: string): WorldRoom {
    const definition = loadWorldDefinition("public");
    const seed = this.randomWorldSeed();
    const generatedWorld = generateWorld(definition, seed);

    const simulator = new WorldRoomSimulator(
      generatedWorld.columns,
      generatedWorld.rows,
      generatedWorld.terrainTiles,
      seed,
    );
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
      simulator,
    };
  }

  private startSimulationLoop(): void {
    if (this.simulationIntervalId !== null) {
      return;
    }
    this.simulationIntervalId = setInterval(() => {
      this.tickAllRooms();
    }, physicsFixedStepMs);
  }

  private tickAllRooms(): void {
    Object.values(this.worlds).forEach((room) => {
      if (Object.keys(room.playerSockets).length === 0) {
        room.simulator.stop();
        return;
      }
      room.simulator.start();
      const snapshot = room.simulator.tickFrame(physicsFixedStepMs);
      if (!snapshot) {
        return;
      }
      this.syncRoomStateFromSimulator(room, snapshot);
      this.sendToRoomAll(room, {
        type: messageTypes.worldSnapshot,
        payload: snapshot,
      });
    });
  }

  private syncRoomStateFromSimulator(
    room: WorldRoom,
    snapshot: WorldSnapshotPayload,
  ): void {
    Object.entries(snapshot.players).forEach(([playerId, state]) => {
      room.playersData[playerId] = {
        ...room.playersData[playerId],
        x: state.x,
        y: state.y,
        horizontalSpeed: state.horizontalSpeed,
        verticalSpeed: state.verticalSpeed,
        facingLeft: state.facingLeft,
        health: state.health,
        isPaused: state.isPaused,
        attackCycle: state.attackCycle,
      };
    });
    room.entitiesData = {};
    Object.entries(snapshot.entities).forEach(([entityId, entity]) => {
      room.entitiesData[entityId] = entity;
    });
  }

  public listen(): void {
    const traceLabel = NetworkDiagnostics.enablementLabel();
    const traceHint = traceLabel ? ` (network trace: ${traceLabel})` : "";
    console.log(`[WS] Waiting for connections...${traceHint}`);
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
    const encoded = this.wire.encodeServer(message);
    this.networkDiagnostics.recordOutbound(message.type, encoded.length);
    socket.send(encoded);
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
    this.networkDiagnostics.logLifecycle(
      `${playerId} lobby connected (${Object.keys(this.lobbySockets).length} clients)`,
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
    const spawnX = room.playerSpawn.x;
    const spawnY = room.playerSpawn.y;
    room.simulator.addPlayer(playerId, spawnX, spawnY);
    room.simulator.start();
    room.playersData[playerId] = {
      isPaused: false,
      health: 6,
      x: spawnX,
      y: spawnY,
    };
    this.networkDiagnostics.logLifecycle(
      `${playerId} joined ${room.name} (${Object.keys(room.playerSockets).length} players)`,
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
    const snapshot = room.simulator.buildImmediateSnapshot();
    this.syncRoomStateFromSimulator(room, snapshot);
    this.sendToRoomPlayer(room, playerId, {
      type: messageTypes.worldSnapshot,
      payload: snapshot,
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
    room.simulator.removePlayer(playerId);
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
    this.networkDiagnostics.recordInbound(message.type, json.length);
    if (this.handleLobbyMessage(playerId, message)) {
      return;
    }
    const room = this.worldRoomForPlayer(playerId);
    if (!room) {
      console.error("World message before join:", message.type);
      return;
    }
    if (message.type === messageTypes.playerInput) {
      room.simulator.queuePlayerInput(playerId, message.payload.sequence, {
        x: message.payload.x,
        y: message.payload.y,
        horizontalSpeed: message.payload.horizontalSpeed,
        verticalSpeed: message.payload.verticalSpeed,
        keyLeft: message.payload.keyLeft,
        keyRight: message.payload.keyRight,
        keyJump: message.payload.keyJump,
        keyDown: message.payload.keyDown,
        keyAttack: message.payload.keyAttack ?? false,
        facingLeft: message.payload.facingLeft,
        isPaused: false,
      });
      return;
    }
    const rule = relayRules[message.type];
    if (!rule) {
      console.error("Unknown message type:", message.type);
      return;
    }
    if (rule.mergesState) {
      const patch = this.stripNonAuthoritativePlayerPatch(
        this.wire.playerStatePatch(message),
        message.type,
      );
      room.playersData[playerId] = merge(room.playersData[playerId], patch);
    }
    if (this.handleEntityMessage(room, playerId, message)) {
      return;
    }
    if (this.isServerOnlyStatePatch(message)) {
      return;
    }
    const outbound = this.buildRelayOutbound(message, playerId, room, rule);
    if (!outbound) {
      return;
    }
    this.deliverRelay(room, playerId, rule, outbound);
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

  private handleEntityMessage(
    room: WorldRoom,
    playerId: string,
    message: ClientToServer,
  ): boolean {
    if (message.type === messageTypes.createEntity) {
      if (message.payload.type !== "slime") {
        return true;
      }
      room.simulator.createSlime(playerId, message.payload.x, message.payload.y);
      return true;
    }
    if (message.type === messageTypes.updateEntity) {
      return true;
    }
    if (message.type === messageTypes.damageEntity) {
      return true;
    }
    return false;
  }

  private broadcastEntitySnapshot(
    room: WorldRoom,
    payload: {
      entitiesData?: Record<string, EntityState>;
      removedEntityIds?: string[];
    },
  ): void {
    this.sendToRoomAll(room, {
      type: messageTypes.updateEntities,
      payload: {
        entitiesData: payload.entitiesData ?? {},
        removedEntityIds: payload.removedEntityIds,
      },
    });
  }

  private broadcastEntityPatch(
    room: WorldRoom,
    entityId: string,
    patch: Omit<EntityState, "type" | "ownerId"> & {
      jump?: boolean;
      knockbackFromLeft?: boolean;
    },
    audience: "all" | "others",
    fromPlayerId?: string,
  ): void {
    const message: ServerToClient = {
      type: messageTypes.updateEntity,
      payload: { entityId, ...patch },
    };
    if (audience === "all") {
      this.sendToRoomAll(room, message);
      return;
    }
    if (!fromPlayerId) {
      return;
    }
    this.sendToRoomOthers(room, fromPlayerId, message);
  }

  private buildRelayOutbound(
    message: ClientToServer,
    playerId: string,
    room: WorldRoom,
    rule: RelayRule,
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
    const payload = message.payload;
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
      this.networkDiagnostics.logLifecycle(
        `${playerId} lobby disconnected (${Object.keys(this.lobbySockets).length} clients)`,
      );
      return;
    }
    delete room.playerSockets[playerId];
    delete room.playersData[playerId];
    room.simulator.removePlayer(playerId);
    delete this.socketWorldIds[playerId];
    this.networkDiagnostics.logLifecycle(
      `${playerId} left ${room.name} (${Object.keys(room.playerSockets).length} players)`,
    );
    this.sendToRoomOthers(room, playerId, {
      type: messageTypes.disconnected,
      payload: { id: playerId },
    });
    this.broadcastWorldsUpdatedToLobby();
  }

  private stripNonAuthoritativePlayerPatch(
    patch: PlayerState,
    type: ClientToServer["type"],
  ): PlayerState {
    if (type !== messageTypes.updatePlayer) {
      return patch;
    }
    const rest = { ...patch };
    delete rest.x;
    delete rest.y;
    delete rest.horizontalSpeed;
    delete rest.verticalSpeed;
    delete rest.keyLeft;
    delete rest.keyRight;
    delete rest.keyJump;
    delete rest.keyDown;
    delete rest.keyAttack;
    delete rest.attackCycle;
    delete rest.facingLeft;
    return rest;
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
