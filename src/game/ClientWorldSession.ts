import * as ex from "excalibur";
import type { Player } from "../actors/Player";
import { NetworkPlayer } from "./network/NetworkPlayer";
import { ClientWorldLivingEntities } from "./ClientWorldLivingEntities";
import { ClientWorldEntities } from "./ClientWorldEntities";
import { GameClient } from "../classes/GameClient";
import { messageTypes } from "../classes/GameWire";
import type {
  AuthoritativePlayerSnapshot,
  EntityPatch,
  EntityState,
  PlayerState,
  WorldSnapshotPayload,
  WorldTerrain,
} from "../classes/GameWire";
import { TerrainTileMap } from "../classes/TerrainTileMap";
import { TileLightingOverlay } from "../classes/TileLightingOverlay";
import { HUDManager } from "../ui/HUDManager";
import { MainMenuUI } from "../ui/MainMenuUI";
import { PlayerListUI } from "../ui/PlayerListUI";
import { TILE_PX } from "../world/worldConfig";
import { LocalPlayerView } from "./localPlayerView";
import type { PlayerHand } from "../combat/playerHands";
import { ClientEntitySeparation } from "./ClientEntitySeparation";
type GameViewSize = {
  width: number;
  height: number;
};

const pingIntervalMs = 2000;

export class ClientWorldSession {
  private readonly engine: ex.Engine;
  private readonly client: GameClient;
  private readonly myPlayerId: string;
  private readonly viewSize: GameViewSize;
  private readonly menuUi: MainMenuUI;
  private readonly playerListUi: PlayerListUI;
  private readonly worldLivingEntities = new ClientWorldLivingEntities();
  private readonly entitySeparation = new ClientEntitySeparation(
    this.worldLivingEntities,
  );

  private localPlayer: NetworkPlayer | null = null;
  private worldEntities: ClientWorldEntities | null = null;
  private readonly remotePlayers: Record<string, NetworkPlayer> = {};
  private terrain: TerrainTileMap | null = null;
  private dummyTileMap: ex.TileMap | null = null;
  private pingIntervalId: number | null = null;

  private constructor(
    engine: ex.Engine,
    client: GameClient,
    myPlayerId: string,
    viewSize: GameViewSize,
    menuUi: MainMenuUI,
    playerListUi: PlayerListUI,
  ) {
    this.engine = engine;
    this.client = client;
    this.myPlayerId = myPlayerId;
    this.viewSize = viewSize;
    this.menuUi = menuUi;
    this.playerListUi = playerListUi;
  }

  public static begin(
    engine: ex.Engine,
    client: GameClient,
    myPlayerId: string,
    playersData: Record<string, PlayerState>,
    entitiesData: Record<string, EntityState>,
    world: WorldTerrain,
    viewSize: GameViewSize,
    menuUi: MainMenuUI,
  ): ClientWorldSession | null {
    const playerListUi = new PlayerListUI();
    const session = new ClientWorldSession(
      engine,
      client,
      myPlayerId,
      viewSize,
      menuUi,
      playerListUi,
    );
    session.start(world, playersData, entitiesData);
    return session;
  }

  public removeRemotePlayer(playerId: string): void {
    this.remotePlayers[playerId]?.kill();
    delete this.remotePlayers[playerId];
    this.worldLivingEntities.unregister(playerId);
    this.playerListUi.removePlayer(playerId);
    this.refreshPlayerList();
  }

  private start(
    world: WorldTerrain,
    playersData: Record<string, PlayerState>,
    entitiesData: Record<string, EntityState>,
  ): void {
    this.menuUi.hide();
    this.menuUi.setCreateWorldEnabled(false);
    this.playerListUi.rememberPings(playersData);
    const myPing = playersData[this.myPlayerId]?.pingMs;
    if (myPing !== undefined) {
      this.playerListUi.setPing(this.myPlayerId, myPing);
    }
    this.refreshPlayerList();
    this.startPingLoop();
    const terrain = new TerrainTileMap({
      pos: ex.vec(0, 0),
      tileWidth: TILE_PX,
      tileHeight: TILE_PX,
      viewSize: ex.vec(this.viewSize.width, this.viewSize.height),
      columns: world.columns,
      rows: world.rows,
      surfaceStartByColumn: world.surfaceStartByColumn,
      solidTiles: world.solidTiles,
      protectedTiles: world.protectedTiles,
      terrainTiles: world.terrainTiles,
    });
    const lighting = new TileLightingOverlay(
      terrain,
      ex.vec(this.viewSize.width, this.viewSize.height),
    );
    this.terrain = terrain;
    this.engine.add(terrain.renderer);
    this.engine.add(lighting);

    const playerSpawn = ex.vec(world.playerSpawn.x, world.playerSpawn.y);
    const dummyTileMap = new ex.TileMap({
      pos: ex.vec(0, 0),
      tileWidth: TILE_PX,
      tileHeight: TILE_PX,
      columns: 1,
      rows: 1,
      renderFromTopOfGraphic: true,
    });
    this.dummyTileMap = dummyTileMap;
    this.localPlayer = new NetworkPlayer(
      playerSpawn,
      dummyTileMap,
      terrain.tileCollisionWorld(),
      this.client,
    );
    this.engine.add(this.localPlayer);
    new LocalPlayerView(this.localPlayer).attach(
      this.engine,
      (hand: PlayerHand) => {
        this.localPlayer?.tryLocalAttack(hand);
      },
    );
    const localPlayerId = this.client.clientId;
    if (localPlayerId) {
      this.registerPlayerLivingEntity(localPlayerId, this.localPlayer);
    }
    this.worldEntities = new ClientWorldEntities({
      engine: this.engine,
      client: this.client,
      myPlayerId: this.myPlayerId,
      getTerrain: () => this.terrain,
      getDummyTileMap: () => this.dummyTileMap,
      worldLivingEntities: this.worldLivingEntities,
    });
    this.worldEntities.applyEntitiesSnapshot({ entitiesData });
    this.engine.add(
      new HUDManager(() => {
        const player = this.localPlayer;
        if (!player) {
          return null;
        }
        return {
          health: player.health,
          maxHealth: player.maxHealth,
        };
      }),
    );
    this.client.send({
      type: messageTypes.createPlayer,
      payload: {
        x: playerSpawn.x,
        y: playerSpawn.y,
      },
    });
    console.log("Players:", playersData);
    this.applyInitialAuthoritativePlayers(playersData);
    this.joinExistingRemotePlayers(terrain, dummyTileMap, playersData);
    this.refreshPlayerList();
    this.engine.on("preupdate", () => {
      this.trySpawnSlimeAtCursor();
    });
    this.engine.on("postupdate", () => {
      this.localPlayer?.tickLocal(this.engine);
      const world = this.terrain?.tileCollisionWorld();
      if (world) {
        this.entitySeparation.tickFrame(this.engine.clock.elapsed(), world);
      }
    });
    this.registerWorldHandlers();
  }

  private registerWorldHandlers(): void {
    this.client.setWorldHandlers({
      [messageTypes.createPlayer]: (msg) => {
        this.handleCreatePlayer(msg.payload);
      },
      [messageTypes.updatePlayer]: (msg) => {
        this.applyRemotePlayerUpdate(msg.payload);
      },
      [messageTypes.updatePing]: (msg) => {
        this.applyPlayerPingUpdate(msg.payload);
      },
      [messageTypes.knockbackPlayer]: (msg) => {
        this.applyPlayerKnockbackUpdate(msg.payload);
      },
      [messageTypes.damagePlayer]: (msg) => {
        this.applyPlayerDamageUpdate(msg.payload);
      },
      [messageTypes.updateEntities]: (msg) => {
        this.applyEntitiesSnapshot(msg.payload);
      },
      [messageTypes.updateEntity]: (msg) => {
        const { entityId, ...patch } = msg.payload;
        this.worldEntities?.applyEntityPatch(entityId, patch);
      },
      [messageTypes.pong]: (msg) => {
        this.applyPongUpdate(msg.payload);
      },
      [messageTypes.worldSnapshot]: (msg) => {
        this.applyWorldSnapshot(msg.payload);
      },
    });
  }

  private applyInitialAuthoritativePlayers(
    playersData: Record<string, PlayerState>,
  ): void {
    Object.entries(playersData).forEach(([playerId, row]) => {
      const snapshot = this.playerStateToAuthoritative(playerId, row);
      if (playerId === this.myPlayerId) {
        this.localPlayer?.applyAuthoritativeSnapshot(snapshot);
        return;
      }
      this.remotePlayers[playerId]?.applyAuthoritativeSnapshot(snapshot);
    });
  }

  private applyWorldSnapshot(snapshot: WorldSnapshotPayload): void {
    Object.entries(snapshot.players).forEach(([playerId, playerSnapshot]) => {
      if (playerId === this.myPlayerId) {
        this.localPlayer?.applyAuthoritativeSnapshot(playerSnapshot);
        return;
      }
      if (!this.remotePlayers[playerId]) {
        return;
      }
      this.remotePlayers[playerId]?.applyAuthoritativeSnapshot(playerSnapshot);
    });
    this.worldEntities?.applyWorldSnapshot(snapshot);
  }

  private playerStateToAuthoritative(
    _playerId: string,
    row: PlayerState,
  ): AuthoritativePlayerSnapshot {
    return {
      x: Number(row.x ?? 0),
      y: Number(row.y ?? 0),
      horizontalSpeed: Number(row.horizontalSpeed ?? 0),
      verticalSpeed: Number(row.verticalSpeed ?? 0),
      facingLeft: row.facingLeft ?? false,
      health: Number(row.health ?? 6),
      isPaused: row.isPaused ?? false,
      attackCycle: 0,
      lastProcessedInputSequence: 0,
      keyLeft: row.keyLeft ?? false,
      keyRight: row.keyRight ?? false,
      keyJump: row.keyJump ?? false,
      keyDown: row.keyDown ?? false,
      keyAttack: row.keyAttack ?? false,
    };
  }

  private refreshPlayerList(): void {
    this.playerListUi.render(
      this.client.clientId,
      Object.keys(this.remotePlayers),
    );
  }

  private handleCreatePlayer(playerState: PlayerState): void {
    const terrain = this.terrain;
    const dummyTileMap = this.dummyTileMap;
    if (!terrain) {
      return;
    }
    if (!dummyTileMap) {
      return;
    }
    const id = String(playerState.id ?? "");
    if (id.length === 0) {
      return;
    }
    this.spawnRemotePlayer(
      terrain,
      dummyTileMap,
      id,
      Number(playerState.x),
      Number(playerState.y),
    );
    this.remotePlayers[id]?.applyRemote(playerState);
    this.playerListUi.setPing(id, playerState.pingMs ?? 0);
    this.refreshPlayerList();
  }

  private spawnRemotePlayer(
    terrain: TerrainTileMap,
    dummyTileMap: ex.TileMap,
    playerId: string,
    x: number,
    y: number,
  ): NetworkPlayer {
    const player = new NetworkPlayer(
      ex.vec(x, y),
      dummyTileMap,
      terrain.tileCollisionWorld(),
    );
    this.remotePlayers[playerId] = player;
    this.engine.add(player);
    this.registerPlayerLivingEntity(playerId, player);
    return player;
  }

  private registerPlayerLivingEntity(entityId: string, player: NetworkPlayer) {
    this.worldLivingEntities.register({
      entityId,
      living: player,
      onWeaponHit: () => {},
    });
  }

  private trySpawnSlimeAtCursor(): void {
    const localPlayer = this.localPlayer;
    if (!localPlayer || !localPlayer.isAlive()) {
      return;
    }
    if (!this.engine.input.keyboard.wasPressed(ex.Keys.R)) {
      return;
    }
    const worldPos = this.engine.input.pointers.primary.lastWorldPos;
    if (!Number.isFinite(worldPos.x) || !Number.isFinite(worldPos.y)) {
      return;
    }
    this.client.send({
      type: messageTypes.createEntity,
      payload: {
        type: "slime",
        x: worldPos.x,
        y: worldPos.y,
      },
    });
  }

  private applyRemotePlayerUpdate(playerState: PlayerState): void {
    const playerId = String(playerState.id ?? "");
    if (playerId.length === 0) {
      return;
    }
    const localPlayerId = this.client.clientId;
    const isLocalPlayerUpdate =
      localPlayerId !== undefined && playerId === localPlayerId;
    if (isLocalPlayerUpdate) {
      this.localPlayer?.applyLocalState(playerState);
      return;
    }
    if (!this.remotePlayers[playerId]) {
      return;
    }
    this.remotePlayers[playerId]?.applyRemote(playerState);
  }

  private joinExistingRemotePlayers(
    terrain: TerrainTileMap,
    dummyTileMap: ex.TileMap,
    playersData: Record<string, PlayerState>,
  ): void {
    Object.entries(playersData).forEach(([peerId, row]) => {
      if (peerId === this.myPlayerId) {
        return;
      }
      const x = Number(row.x);
      const y = Number(row.y);
      this.spawnRemotePlayer(
        terrain,
        dummyTileMap,
        peerId,
        x,
        y,
      );
      this.remotePlayers[peerId]?.applyRemote(row);
    });
  }

  private applyEntitiesSnapshot(payload: {
    entitiesData?: Record<string, EntityPatch>;
    removedEntityIds?: string[];
  }): void {
    this.worldEntities?.applyEntitiesSnapshot(payload);
  }

  private playerForId(playerId: string): Player | null {
    if (this.client.clientId === playerId) {
      return this.localPlayer;
    }
    return this.remotePlayers[playerId] ?? null;
  }

  private applyPlayerKnockbackUpdate(update: {
    id?: string;
    targetId: string;
  }): void {
    const localPlayerId = this.client.clientId;
    if (!localPlayerId || update.targetId !== localPlayerId) {
      return;
    }
    if (!update.id) {
      return;
    }
    const attacker = this.playerForId(update.id);
    const target = this.playerForId(update.targetId);
    if (!attacker || !target) {
      return;
    }
    target.knockBackFromFacing(attacker.isFacingLeft());
  }

  private applyPlayerDamageUpdate(update: {
    id: string;
    targetId: string;
    damage: number;
  }): void {
    const localPlayerId = this.client.clientId;
    if (!localPlayerId || update.targetId !== localPlayerId) {
      return;
    }
    if (!update.id) {
      return;
    }
    const attacker = this.playerForId(update.id);
    const target = this.playerForId(update.targetId);
    if (!attacker || !target) {
      return;
    }
    target.takeDamageFrom(attacker, update.damage);
  }

  private applyPlayerPingUpdate(payload: PlayerState): void {
    const playerId = String(payload.id ?? "");
    const pingMs = Number(payload.pingMs);
    if (!playerId || !Number.isFinite(pingMs)) {
      return;
    }
    this.playerListUi.setPing(playerId, pingMs);
    this.refreshPlayerList();
  }

  private applyPongUpdate(payload: { sentAt?: number }): void {
    const sentAt = Number(payload.sentAt);
    if (!Number.isFinite(sentAt)) {
      return;
    }
    const pingMs = Math.max(0, Math.round(performance.now() - sentAt));
    this.playerListUi.setPing(this.client.clientId, pingMs);
    this.refreshPlayerList();
    this.client.send({
      type: messageTypes.updatePing,
      payload: { pingMs },
    });
  }

  private sendPing(): void {
    this.client.send({
      type: messageTypes.ping,
      payload: { sentAt: performance.now() },
    });
  }

  private startPingLoop(): void {
    if (this.pingIntervalId !== null) {
      return;
    }
    this.sendPing();
    this.pingIntervalId = window.setInterval(() => {
      this.sendPing();
    }, pingIntervalMs);
  }

}
